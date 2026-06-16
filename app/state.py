from typing import TypedDict, Optional, List, Annotated
from operator import add


class IntelState(TypedDict):
    # Inputs
    company_name: str
    website_url: str
    linkedin_url: str
    seed_intel: Optional[dict]  # known facts (e.g. from a bulk CSV) — authoritative, merged into research

    # Phase 1: website research
    website_intel: Optional[dict]

    # Phase 2: LinkedIn contact + activity research
    linkedin_intel: Optional[dict]

    # Phase 3: product context from Brain MCP (runs after research)
    product_context: Optional[str]
    similar_accounts: Optional[List[dict]]

    # Phase 4: generated artifacts
    briefing: Optional[str]
    objections: Optional[str]
    sequence: Optional[list]
    scripts: Optional[list]
    variants: Optional[list]  # A/B/C first-touch opener variants for testing

    # Error accumulation
    errors: Annotated[List[str], add]
