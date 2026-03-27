"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { readFileUrlToArrayBuffer } from "@/lib/file-url-to-buffer";
import { parseSpreadsheetBufferForChat } from "@/lib/spreadsheet-chat-grid";
import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import { XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Load + xlsx parse; keep bounded so a bad URL cannot hang forever. */
const OPEN_SPREADSHEET_MS = 120_000;

const ROW_HEIGHT_PX = 28;
const VIRTUAL_OVERSCAN = 3;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} (>${Math.round(ms / 1000)}s)`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Lets the browser paint "Opening…" before heavy work schedules. */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function SpreadsheetEditorPanel({
  file,
  onClose,
  variant = "inline",
}: {
  file: FileUIPart;
  onClose: () => void;
  /** `sidebar`: used in right file panel — title/close live in panel chrome. */
  variant?: "inline" | "sidebar";
}) {
  const title = file.filename?.trim() || "Spreadsheet";
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [grids, setGrids] = useState<Record<string, string[][]>>({});
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(320);

  useEffect(() => {
    const sourceUrl = file.url?.trim();
    if (!sourceUrl) {
      setPhase("error");
      setLoadError("No file URL");
      return;
    }

    let cancelled = false;

    setPhase("loading");
    setLoadError(null);
    setGrids({});
    setSheetNames([]);
    setActiveSheet("");
    setTruncated(false);
    setScrollTop(0);

    (async () => {
      try {
        await yieldToPaint();
        if (cancelled) {
          return;
        }
        const buf = await withTimeout(
          readFileUrlToArrayBuffer(sourceUrl, MAX_FILE_BYTES),
          OPEN_SPREADSHEET_MS,
          "Download timed out",
        );
        if (cancelled) {
          return;
        }
        const parsed = await withTimeout(
          parseSpreadsheetBufferForChat(buf),
          OPEN_SPREADSHEET_MS,
          "Parse timed out",
        );
        if (cancelled) {
          return;
        }
        setGrids(parsed.grids);
        setSheetNames(parsed.sheetNames);
        setActiveSheet(parsed.sheetNames[0] ?? "");
        setTruncated(parsed.truncated);
        setPhase("ready");
        setScrollTop(0);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Load failed");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file.url]);

  const grid = activeSheet ? (grids[activeSheet] ?? [[""]]) : [[""]];
  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 1;

  useLayoutEffect(() => {
    if (phase !== "ready") {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const sync = () => setViewportH(el.clientHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, activeSheet]);

  const virtualWindow = useMemo(() => {
    const start = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT_PX) - VIRTUAL_OVERSCAN,
    );
    const visible =
      Math.ceil(viewportH / ROW_HEIGHT_PX) + 2 * VIRTUAL_OVERSCAN;
    const end = Math.min(rowCount, start + visible);
    return { start, end };
  }, [scrollTop, rowCount, viewportH]);

  useEffect(() => {
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activeSheet]);

  const onCellChange = useCallback(
    (r: number, c: number, v: string) => {
      if (!activeSheet) {
        return;
      }
      setGrids((prev) => {
        const src = prev[activeSheet] ?? [[""]];
        const g = src.map((row) => [...row]);
        while (g.length <= r) {
          g.push(Array.from({ length: Math.max(1, c + 1) }, () => ""));
        }
        const existingRow = g[r] ?? [];
        const row = [...existingRow];
        while (row.length <= c) {
          row.push("");
        }
        row[c] = v;
        g[r] = row;
        const maxC = Math.max(1, ...g.map((x) => x.length));
        for (let i = 0; i < g.length; i++) {
          const ri = g[i];
          if (!ri) {
            continue;
          }
          while (ri.length < maxC) {
            ri.push("");
          }
        }
        return { ...prev, [activeSheet]: g };
      });
    },
    [activeSheet],
  );

  const downloadXlsx = useCallback(async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const name of sheetNames) {
      const g = grids[name];
      if (!g) {
        continue;
      }
      const safeName = name.slice(0, 31) || "Sheet";
      const ws = XLSX.utils.aoa_to_sheet(g);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    }
    const base = file.filename?.trim() || "workbook";
    const outName = /\.(xlsx|xls|xlsm)$/i.test(base) ? base : `${base}.xlsx`;
    XLSX.writeFile(wb, outName);
  }, [file.filename, grids, sheetNames]);

  const hint = useMemo(() => {
    if (phase === "error") {
      return loadError ?? "Could not load.";
    }
    if (truncated) {
      return "Only part of the sheet is shown in chat; download saves that part.";
    }
    return null;
  }, [phase, loadError, truncated]);

  const { start: vStart, end: vEnd } = virtualWindow;
  const topSpacer = vStart * ROW_HEIGHT_PX;
  const bottomSpacer = Math.max(0, (rowCount - vEnd) * ROW_HEIGHT_PX);

  return (
    <div
      className={cn(
        "border-border bg-card/60 w-full max-w-full rounded-lg border shadow-sm ring-1 ring-border/40",
        variant === "inline" && "mt-2 p-3",
        variant === "sidebar" &&
          "flex min-h-0 flex-1 flex-col border-0 bg-transparent p-0 shadow-none ring-0",
      )}
      data-slot="spreadsheet-editor-panel"
    >
      {variant === "inline" ? (
        <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{title}</p>
            {hint ? (
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                {hint}
              </p>
            ) : null}
            {phase === "error" ? (
              <p className="text-muted-foreground mt-1 text-xs leading-snug">
                If the link is valid, try{" "}
                <span className="font-medium">Open in new tab</span> — many
                hosts block in-page fetch (CORS).
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {phase === "ready" ? (
              <Button
                onClick={() => void downloadXlsx()}
                size="sm"
                type="button"
              >
                Download .xlsx
              </Button>
            ) : null}
            <Button
              aria-label="Close editor"
              className="size-8 p-0"
              onClick={onClose}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-2 flex min-w-0 flex-col gap-1">
          {hint ? (
            <p className="text-muted-foreground text-xs leading-snug">
              {hint}
            </p>
          ) : null}
          {phase === "error" ? (
            <p className="text-muted-foreground text-xs leading-snug">
              If the link is valid, try{" "}
              <span className="font-medium">Open in new tab</span> — many hosts
              block in-page fetch (CORS).
            </p>
          ) : null}
          <div className="flex justify-end">
            {phase === "ready" ? (
              <Button
                onClick={() => void downloadXlsx()}
                size="sm"
                type="button"
              >
                Download .xlsx
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {phase === "error" && file.url ? (
        <a
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mb-2 inline-flex w-fit text-xs",
          )}
          href={file.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open in new tab
        </a>
      ) : null}

      {phase === "loading" ? (
        <div className="text-muted-foreground py-10 text-center text-sm">
          Opening…
        </div>
      ) : null}

      {phase === "ready" && sheetNames.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1 border-border border-b pb-2">
          {sheetNames.map((name) => (
            <Button
              key={name}
              onClick={() => setActiveSheet(name)}
              size="sm"
              type="button"
              variant={name === activeSheet ? "secondary" : "ghost"}
            >
              {name}
            </Button>
          ))}
        </div>
      ) : null}

      {phase === "ready" ? (
        <div
          className={cn(
            "overflow-auto rounded-md border border-border",
            variant === "inline" && "max-h-[min(50vh,420px)]",
            variant === "sidebar" && "min-h-48 flex-1",
          )}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          ref={scrollRef}
        >
          <div
            className="box-border w-max min-w-full"
            style={{
              minHeight: rowCount * ROW_HEIGHT_PX,
              paddingTop: topSpacer,
              paddingBottom: bottomSpacer,
            }}
          >
            <table className="w-max min-w-full border-collapse text-xs">
              <tbody>
                {grid.slice(vStart, vEnd).map((row, sliceIdx) => {
                  const ri = vStart + sliceIdx;
                  return (
                    <tr key={ri} style={{ height: ROW_HEIGHT_PX }}>
                      {Array.from({ length: colCount }, (_, ci) => (
                        <td
                          className="border-border border p-0 align-top"
                          key={ci}
                        >
                          <input
                            className="box-border h-[26px] min-w-20 w-full bg-transparent px-1.5 text-xs leading-none outline-none focus-visible:bg-muted/40"
                            onChange={(e) =>
                              onCellChange(ri, ci, e.target.value)
                            }
                            value={row[ci] ?? ""}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
