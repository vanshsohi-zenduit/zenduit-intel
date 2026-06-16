"""
LangGraph pipeline.

website_research → linkedin → context → strategy → complete → END

Phase order:
  1 — website_research  (research_node)
  2 — linkedin          (linkedin_node)
  3 — context           (context_node / Brain MCP)
  4 — strategy          (strategy_node)
"""
from langgraph.graph import StateGraph, END

from app.state import IntelState
from app.nodes.research_node import research_node
from app.nodes.linkedin_node import linkedin_node
from app.nodes.context_node import context_node
from app.nodes.strategy_node import strategy_node
from app.nodes.complete_node import complete_node


def build_graph():
    g = StateGraph(IntelState)

    g.add_node("website_research", research_node)
    g.add_node("linkedin",         linkedin_node)
    g.add_node("context",          context_node)
    g.add_node("strategy",         strategy_node)
    g.add_node("complete",         complete_node)

    g.set_entry_point("website_research")
    g.add_edge("website_research", "linkedin")
    g.add_edge("linkedin",         "context")
    g.add_edge("context",          "strategy")
    g.add_edge("strategy",         "complete")
    g.add_edge("complete",         END)

    return g.compile()
