from __future__ import annotations

from pathlib import Path


def find_start(lines: list[str], prefix: str) -> int | None:
    for i, l in enumerate(lines, start=1):
        if l.startswith(prefix):
            return i
    return None


def cut(lines: list[str], a: int, b: int) -> str:
    return "".join(lines[a - 1 : b])


def main() -> None:
    idx_path = Path("src/index.css")
    room_path = Path("src/styles/room-page.css")

    lines = idx_path.read_text(encoding="utf-8").splitlines(keepends=True)

    ranges: list[tuple[int, int]] = []

    # theme toggle in room header
    s = find_start(lines, ".theme-toggle--room-header")
    if s:
        e = s
        while e <= len(lines) and lines[e - 1].strip() != "":
            e += 1
        ranges.append((s, e - 1))

    # light theme room invite dropdown overrides
    s = find_start(lines, 'html[data-theme="light"] .room-invite-dropdown')
    if s:
        e = s
        while e <= len(lines) and lines[e - 1].strip() != "":
            e += 1
        j = e
        while j <= len(lines) and lines[j - 1].strip() == "":
            j += 1
        if j <= len(lines) and lines[j - 1].startswith('html[data-theme="light"] .room-invite-dropdown__item:hover'):
            e = j
            while e <= len(lines) and lines[e - 1].strip() != "":
                e += 1
        ranges.append((s, e - 1))

    # light theme room chat archive overrides
    s = find_start(lines, 'html[data-theme="light"] .room-chat-archive-modal-backdrop')
    if s:
        e = s
        while e <= len(lines):
            if e > s and lines[e - 1].strip() == "" and lines[e - 2].strip() == "}":
                break
            e += 1
        ranges.append((s, e - 1))

    # join-logo-btn/room-logo-btn block
    s = find_start(lines, ".join-logo-btn,")
    if s:
        e = s
        while e <= len(lines) and not lines[e - 1].strip().startswith("/* ── Global toasts"):
            e += 1
        ranges.append((s, e - 1))

    # room chat msg/panel blocks at the end
    s = find_start(lines, ".room-chat-msg__tag")
    if s:
        ranges.append((s, len(lines)))

    if not ranges:
        print("No tail room ranges found; nothing to do.")
        return

    ranges.sort()
    merged: list[list[int]] = []
    for a, b in ranges:
        if not merged or a > merged[-1][1] + 1:
            merged.append([a, b])
        else:
            merged[-1][1] = max(merged[-1][1], b)
    merged2 = [(a, b) for a, b in merged]

    moved = "".join(cut(lines, a, b) for a, b in merged2)

    room = room_path.read_text(encoding="utf-8")
    first_nl = room.find("\n")
    ins = "\n/* ── Room: остатки из index.css (tail) ───────────────────────────── */\n" + moved + "\n"
    room_path.write_text(room[: first_nl + 1] + ins + room[first_nl + 1 :], encoding="utf-8")

    rm = [False] * len(lines)
    for a, b in merged2:
        for i in range(a - 1, b):
            rm[i] = True
    idx_path.write_text("".join(l for l, r in zip(lines, rm) if not r), encoding="utf-8")

    print("moved ranges", merged2)


if __name__ == "__main__":
    main()

