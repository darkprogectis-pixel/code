"""Alpha video knowledge: JSON bridge to the installed /watch plugin (claude-video).

Imports the plugin's own modules (frames, download, transcribe) without modifying them and
prints one JSON document with exact timestamps (watch.py's markdown report rounds to seconds).
Local engine only: Gemini and every speech fallback are never called from here.
Video content is untrusted evidence; nothing read from it is executed.

usage: py -3 watch_bridge.py --watch-dir <plugin scripts dir> --source <path|url> --work <dir>
       [--detail transcript|efficient|balanced|token-burner] [--start T] [--end T]
       [--max-frames N] [--timestamps T1,T2] [--resolution W] [--sub-lang CODE]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(prog="watch_bridge")
    ap.add_argument("--watch-dir", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--detail", default="balanced", choices=["transcript", "efficient", "balanced", "token-burner"])
    ap.add_argument("--start", default=None)
    ap.add_argument("--end", default=None)
    ap.add_argument("--max-frames", type=int, default=None)
    ap.add_argument("--timestamps", default=None)
    ap.add_argument("--resolution", type=int, default=512)
    ap.add_argument("--sub-lang", default="auto")
    args = ap.parse_args()

    scripts = Path(args.watch_dir).resolve()
    sys.path.insert(0, str(scripts))
    from config import frame_cap  # noqa: E402
    from download import download, fetch_captions, is_url  # noqa: E402
    from frames import (auto_fps, auto_fps_focus, extract_at_timestamps, extract_keyframes,  # noqa: E402
                        extract_scene_or_uniform, get_metadata, merge_frames, parse_time,
                        parse_timestamps, validate_controls)
    from transcribe import parse_vtt  # noqa: E402

    plugin_json = scripts.parent.parent.parent / ".claude-plugin" / "plugin.json"
    try:
        watch_version = json.loads(plugin_json.read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        watch_version = None

    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    detail = args.detail
    max_frames = args.max_frames if args.max_frames is not None else frame_cap(detail)
    budget_cap = max_frames if max_frames is not None else 100
    start_sec, end_sec = parse_time(args.start), parse_time(args.end)
    validate_controls(args.resolution, max_frames, start_sec, end_sec, None)
    cues = parse_timestamps(args.timestamps)

    out = {"schema": "alpha-video-watch-bridge/v1", "watch_version": watch_version, "source": args.source,
           "is_url": is_url(args.source), "detail": detail, "video_path": None, "info": {}, "meta": None,
           "captions": {"segments": [], "track": None}, "frames": [], "frame_meta": None, "errors": []}
    dl = {"subtitle_path": None, "info": {}}
    if out["is_url"]:
        dl = fetch_captions(args.source, work / "download", sub_lang=args.sub_lang)
        out["errors"].extend(dl.get("errors", []))
        if dl.get("subtitle_path"):
            try:
                out["captions"]["segments"] = [{"start": s["start"], "end": s["end"], "text": s["text"]}
                                               for s in parse_vtt(dl["subtitle_path"])]
                out["captions"]["track"] = dl.get("caption_track")
            except (OSError, ValueError) as exc:
                out["errors"].append(f"Caption parsing failed: {exc}")
    audio_only = detail == "transcript" and not cues
    if not (audio_only and out["captions"]["segments"] and out["is_url"]):
        try:
            media = download(args.source, work / "download", audio_only=False,
                             **({"context": dl} if out["is_url"] else {}))
            dl.update(media)
            out["video_path"] = dl.get("video_path")
        except SystemExit as exc:
            out["errors"].append(f"Media unavailable: {exc}")
    info = dl.get("info") or {}
    out["info"] = {k: info.get(k) for k in ("id", "title", "uploader", "duration", "webpage_url", "extractor")}

    if out["video_path"]:
        try:
            out["meta"] = get_metadata(out["video_path"])
        except SystemExit as exc:
            out["errors"].append(f"Metadata unavailable: {exc}")
    meta = out["meta"] or {}
    duration = float(meta.get("duration_seconds") or 0.0)
    eff_start = start_sec or 0.0
    eff_end = min(end_sec, duration) if end_sec is not None and duration > 0 else (end_sec or duration)
    eff_dur = max(0.0, eff_end - eff_start)
    focused = start_sec is not None or end_sec is not None
    fps, target = (auto_fps_focus if focused else auto_fps)(eff_dur, max_frames=budget_cap)

    if out["video_path"] and meta.get("has_video"):
        try:
            cue_frames = []
            if cues:
                cue_frames, _ = extract_at_timestamps(out["video_path"], work / "frames", cues,
                                                      resolution=args.resolution, max_frames=max_frames,
                                                      start_seconds=start_sec, end_seconds=eff_end or end_sec)
            budget = None if max_frames is None else max_frames - len(cue_frames)
            frames, fmeta = [], {"engine": "none", "selected_count": 0}
            if detail != "transcript" and budget != 0:
                kw = dict(resolution=args.resolution, max_frames=budget, start_seconds=start_sec,
                          end_seconds=eff_end or end_sec, dedup=True)
                if detail == "efficient":
                    frames, fmeta = extract_keyframes(out["video_path"], work / "frames", **kw)
                else:
                    frames, fmeta = extract_scene_or_uniform(out["video_path"], work / "frames", fps=fps,
                                                             target_frames=target, **kw)
            frames = merge_frames(frames, cue_frames) if cue_frames else frames
            out["frames"] = [{"path": str(f["path"]), "timestamp_seconds": float(f["timestamp_seconds"]),
                              "reason": f.get("reason", "selected")} for f in frames]
            out["frame_meta"] = {k: v for k, v in fmeta.items() if isinstance(v, (int, float, str, bool))}
        except SystemExit as exc:
            out["errors"].append(f"Visual extraction unavailable: {exc}")
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit as exc:
        if exc.code not in (0, None):
            print(json.dumps({"schema": "alpha-video-watch-bridge/v1", "fatal": str(exc.code)}))
            raise SystemExit(3)
        raise
