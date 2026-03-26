import { getInstallationById } from "@/core/installations/repo";
import { getConnectorDriver } from "@/core/connectors/registry";
import type { ChannelTarget, OutboundPayload } from "@/core/connectors/types";

export async function dispatchOutbound(input: {
  installationId: string;
  target: ChannelTarget;
  payload: OutboundPayload;
}) {
  const installation = await getInstallationById(input.installationId);
  if (!installation) {
    throw new Error("Installation not found");
  }

  const driver = getConnectorDriver(installation.connectorKind);
  if (!driver.outbound) {
    throw new Error(
      `Connector ${installation.connectorKind} has no outbound support`,
    );
  }

  return driver.outbound.send({
    config: installation.config,
    installation,
    target: input.target,
    payload: input.payload,
  });
}
