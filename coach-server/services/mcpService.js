// MCP playbook context — graceful fallback when no MCP server is configured.
const FALLBACK_CONTEXT = "No playbook context available.";

export async function fetchPlaybookContext(transcriptSnippet, agentId) {
  const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
  if (!MCP_SERVER_URL) return FALLBACK_CONTEXT;

  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
    const client = new Client({ name: "zenduit-coach-server", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "lookup_sales_playbook",
      arguments: { transcript_snippet: transcriptSnippet, agent_id: agentId },
    });

    if (result?.content?.length > 0) {
      const textContent = result.content.find((c) => c.type === "text");
      if (textContent?.text) return textContent.text;
    }
    return FALLBACK_CONTEXT;
  } catch (err) {
    console.error("[MCP] Fallback:", err.message);
    return FALLBACK_CONTEXT;
  }
}
