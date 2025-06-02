Title: About Custom Integrations Using Remote MCP | Anthropic Help Center

URL Source: https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp

Markdown Content:
⚠️Security & Privacy with Custom Integrations (beta)
----------------------------------------------------

Be aware that custom integrations allow you to connect Claude to services that have not been verified by Anthropic, and allow Claude to access and take action in these services. Consider the following to minimize security and privacy risks when using this feature:

In some circumstances, MCP server developers may change their tool’s behavior without warning the user, potentially leading to unexpected or malicious behavior. We attempt to block suspicious MCP tool calls, but we suggest taking precautions to isolate Claude from sensitive data.

For more guidance, review the **Security & Privacy Considerations** section below.

What are custom integrations?
-----------------------------

Custom integrations let you connect Claude directly to the tools and data sources that matter most to your workflows. This enables Claude to operate within your favorite software and draw insights from the complete context of your external tools.

You can:

What are remote MCP servers?
----------------------------

MCP is an open standard, created by Anthropic, for AI applications to connect to tools and data.

Previously, MCP servers primarily ran locally (i.e. on a user’s laptop). Now, developers can build and host remote MCP servers that communicate with AI apps over the internet. Remote MCP servers give models access to internet-hosted tools and data, transforming Claude into an informed teammate that can independently handle complex, multi-step projects tailored to your needs.

Getting Started with Custom Integrations
----------------------------------------

### Using Existing Integrations

To get started, choose from [existing integrations](https://support.anthropic.com/en/articles/11176164-pre-built-integrations-using-remote-mcp). For example, [Zapier MCP](https://zapier.com/mcp) lets users connect Claude to thousands of apps using Zapier's pre-built connections.

### Building Integrations

To learn about building integrations to use with Claude, we recommend reviewing the following resources:

### Adding Integrations to Claude

#### Claude Enterprise and Teams (Owners and Primary Owners)

#### Claude Max

### Removing or Editing Integrations

You can remove or edit the configuration of your integration:

### Enabling Integrations

You can enable Integrations via the Search and tools menu in the chat interface. For integrations that require authentication, click “Connect” to go through the authentication flow and grant permission for Claude to access the service. After connecting, use the same menu to enable or disable specific tools made available by the server.

Security & Privacy Considerations
---------------------------------

Custom integrations allow you to connect Claude to arbitrary services that have not been verified by Anthropic. When you connect Claude to external services, you're granting it the ability to access and potentially modify data within those services based on your permissions. It’s important to make sure you’re only connecting to remote MCP servers that you trust and that you’re aware of Claude’s interactions with connected integrations.

### **Security and Permissions**

When you add a custom integration to Claude, you'll typically go through an OAuth authentication process to securely sign in to the application and grant specific permissions. This allows Claude to interact with the application on your behalf, without Claude ever seeing your actual password. You can revoke these permissions at any time by disconnecting the integration in Claude's settings or the third-party service's security settings.

Remote MCP servers act as intermediaries between Claude and external applications. You should:

### **Reporting Malicious MCP Servers**

If you become aware of a malicious MCP server, please report it to us at **[security@anthropic.com](mailto:security@anthropic.com)**.

### **Taking actions with tools**

Remote MCP servers give Claude tools it can invoke during your conversation. The developer of an MCP server can define what these tools do, including:

Claude can only access resources that you’ve given the server permission to access, but you should:

### **Using Claude with Research**

_Note:_[Advanced Research](https://www.anthropic.com/news/integrations) is not currently able to invoke tools from local MCP servers.

[Research](https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai) allows Claude to deeply investigate queries by searching through hundreds of internal and external sources. During the research process, Claude can invoke tools from your integrations automatically without further approval.

When using Research with custom integrations:

* * *

Related Articles

[Setting Up Integrations on Claude.ai](https://support.anthropic.com/en/articles/10168395-setting-up-integrations-on-claude-ai)[Getting started with Model Context Protocol (MCP) on Claude for Desktop](https://support.anthropic.com/en/articles/10949351-getting-started-with-model-context-protocol-mcp-on-claude-for-desktop)[Using the Gmail and Google Calendar Integrations](https://support.anthropic.com/en/articles/11088742-using-the-gmail-and-google-calendar-integrations)[Using Research on Claude.ai](https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai)[Pre-built Integrations Using Remote MCP](https://support.anthropic.com/en/articles/11176164-pre-built-integrations-using-remote-mcp)
