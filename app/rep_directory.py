from app.clients.clickup import resolve_clickup_id


async def resolve_rep(owner_name: str, owner_email: str = "") -> dict:
    """Resolve a Zoho CRM owner name/email to a rep dict with ClickUp member ID."""
    clickup_id = resolve_clickup_id(owner_name) or resolve_clickup_id(owner_email)
    return {
        "name": owner_name,
        "email": owner_email,
        "clickupMemberId": clickup_id,
    }
