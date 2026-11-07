"""Model Context Protocol (MCP) server for AutoClip.

Exposes AutoClip pipeline stages as stdio MCP tools for Claude Desktop,
Antigravity IDE, and any other MCP-compatible AI client.
"""

from .server import create_mcp_server, main

__all__ = ["create_mcp_server", "main"]

