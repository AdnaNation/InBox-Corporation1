export function summarizeMongoConnectionError(error) {
  const serverDescriptions = error?.reason?.servers;
  const servers = serverDescriptions && typeof serverDescriptions.values === "function"
    ? [...serverDescriptions.values()].map((server) => ({
        type: server?.type || null,
        errorName: server?.error?.name || null,
        errorCode: server?.error?.code || server?.error?.cause?.code || null,
      }))
    : [];

  return {
    name: error?.name || "Error",
    code: error?.code || null,
    causeCode: error?.cause?.code || null,
    topologyType: error?.reason?.type || null,
    servers,
  };
}
