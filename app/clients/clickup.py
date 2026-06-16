import time
import logging
import httpx

from app.credentials import get_config

log = logging.getLogger(__name__)

CLICKUP_MEMBERS: dict = {
    "Sidhesh Kanojia": 164526440,
    "Savo Lekovic": 87426920,
    "Eugen Lisov": 87425888,
    "Vansh Sohi": 204264796,
    "Liezel Ode": 87425115,
    "Nouhaila Lachhab": 87425114,
    "George TrackCAM": 87422846,
    "Matt": 87422845,
    "Kristen Gandolfo": 87422844,
    "Tania Gomez": 87417673,
    "Puneet Phull": 87417672,
    "jin": 174026607,
    "Omar Khawaja": 87413047,
    "Basit Saleem": 54140829,
    "Rachael George": 87400469,
    "Aghila Kunjumon": 87400468,
    "Sameeha Naseem": 81321734,
    "ronaldcastro@gofleet.ca": 87390616,
    "Sam Aggarwal": 162205964,
    "Harshit Sharma": 212503606,
    "Kamal Nader": 87388960,
    "Fendri Firas": 272555065,
    "Yasmim Barreto": 87381380,
    "Omotoyosi Adegbite": 87381379,
    "Reem Al-Ashry": 87381378,
    "Larissa Moreno": 87381357,
    "Fernanda Morais": 87379183,
    "Geraldine Moran": 87376937,
    "Mike Pandit": 87372191,
    "Deepika Verma": 87370373,
    "Jo Vandendool": 87365308,
    "Karen Rivera": 87365302,
    "Arturo Martinez": 168077796,
    "Israa Sabry": 87354404,
    "Nandhini P V": 87349442,
    "Harsha Patnala": 87344852,
    "Alfredo Morales": 87342343,
    "arturomartinez@zenduty.com": 87342342,
    "Manuel Tuazon": 87341196,
    "John Oliver": 87338611,
    "Deepka Singh": 87333822,
    "Bradley Lewis": 156209420,
    "Maria Daniela": 156154509,
    "Navadeep Raja": 218548503,
    "Rishabh Bagrecha": 87304521,
    "Jay Butani": 164524378,
    "Ibraheem Sadiq": 87304519,
    "Andrey": 288648779,
    "Alex Sadovoy": 81598355,
    "Aniket Kale": 81598353,
    "Samprity Chakraborty": 81598209,
    "Mae Annem": 270876484,
    "Hemant Joshi": 81598205,
    "Ammar Nawaz": 81593459,
    "Elton Evangelista": 81591281,
    "Alex Lvov": 81578142,
    "Rohit Raut": 164446231,
    "Miguel Miralles": 81552449,
    "Manish Ratra": 81454046,
    "Shane Robinson": 81534794,
    "Ayesha Zafar": 164670698,
    "Komal Bajpai": 164611271,
    "George-Paul Cretu": 12724613,
    "Kenny Rojas": 81491530,
    "Alvin Cordoviz": 81458607,
    "Adriana Rosas": 81455397,
    "Safa Awad": 270882110,
    "Prateek Saini": 164501020,
    "Morgan Crunkleton": 81432509,
    "Kartik Saxena": 120084865,
    "Thomas Fox": 120126411,
    "Joan Hipolito": 81426782,
    "Yaseen Shafiq": 164474528,
    "Sean Pooya": 120110011,
    "Clinton Elvie": 120109468,
    "Dustin Sirois": 81417516,
    "Puneet Randhawa": 81370596,
    "Miguel Aguila": 81356008,
    "Astrid Nainggolan": 81349344,
    "Subal Saini": 81328624,
    "Musa Khan": 81326815,
    "Iffa Anwar": 81321739,
    "Nikitha Vinod": 81321750,
    "Paul Ferreira": 16825630,
    "Riza Mae Obenita": 81321742,
    "Ron Sabbun": 114002296,
    "Sandeep Maller": 81321737,
    "Karan Vinaik": 81321755,
    "Fahad Javed": 81321736,
    "Dur E Nayab": 81321752,
    "Ahmad Afra": 54771644,
    "Adrian Aymont": 26371198,
    "Abid Ali": 81321730,
    "neelam panchal": 81321724,
    "Vishal Arora": 81319608,
    "Nenad Bosak": 81319599,
    "Gary B": 12609300,
    "Vishal": 10716193,
    "Ankita Raj": 108023101,
    "Joseph Joy": 108020996,
}

_LOWER_MEMBERS = {k.lower(): v for k, v in CLICKUP_MEMBERS.items()}


def resolve_clickup_id(name: str):
    if not name:
        return None
    if name in CLICKUP_MEMBERS:
        return CLICKUP_MEMBERS[name]
    nl = name.strip().lower()
    if nl in _LOWER_MEMBERS:
        return _LOWER_MEMBERS[nl]
    first = nl.split()[0] if nl.split() else ""
    for k, v in _LOWER_MEMBERS.items():
        if k.split() and k.split()[0] == first:
            return v
    return None


async def create_lead_task(rep: dict, entry: dict):
    token = get_config("CLICKUP_API_TOKEN")
    list_id = get_config("CLICKUP_LIST_ID")
    if not token or not list_id:
        return None
    intel = entry.get("intel") or {}
    public_url = get_config("PUBLIC_APP_URL", "http://localhost:8080")
    lead_url = f"{public_url}/lead/{entry.get('id', '')}"
    overdue_h = int(get_config("CLICKUP_OVERDUE_HOURS", "48"))
    due_ms = int((time.time() + overdue_h * 3600) * 1000)
    assignees = [rep["clickupMemberId"]] if rep.get("clickupMemberId") else []
    payload = {
        "name": f"Call {entry.get('companyName', '')} — Score {intel.get('score', '?')}/10",
        "assignees": assignees,
        "markdown_description": (
            f"**Company:** {entry.get('companyName', '')}\n"
            f"**Contact:** {intel.get('contactName', '')} ({intel.get('contactTitle', '')})\n"
            f"**Score:** {intel.get('score', '?')}/10\n"
            f"**Top Pain Point:** {intel.get('topPainPoint', '')}\n\n"
            f"[View Full Brief]({lead_url})"
        ),
        "due_date": due_ms,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.clickup.com/api/v2/list/{list_id}/task",
                headers={
                    "Authorization": token,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            data = resp.json()
            task_id = data.get("id")
            log.info("ClickUp task created: %s for %s", task_id, entry.get("companyName"))
            return task_id
    except Exception as e:
        log.warning("ClickUp task creation failed: %s", e)
        return None


async def fetch_tasks(list_id: str) -> list:
    token = get_config("CLICKUP_API_TOKEN")
    if not token or not list_id:
        return []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"https://api.clickup.com/api/v2/list/{list_id}/task",
                headers={"Authorization": token},
                params={"include_closed": "true", "page": "0"},
            )
            return resp.json().get("tasks", [])
    except Exception as e:
        log.warning("ClickUp fetch tasks failed: %s", e)
        return []
