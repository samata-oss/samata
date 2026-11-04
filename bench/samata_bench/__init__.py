"""Black-box latency harness for voice-agent platforms.

Dials each target's phone number from a LiveKit room, plays scripted caller
utterances, and times how long the agent takes to start speaking. The same
caller and the same detector are used for every target, so the numbers are
comparable. See `python -m samata_bench --help`.
"""
