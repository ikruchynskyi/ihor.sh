# Mochi's voice (yomu/chat.html): Irodori-TTS, the model and the young woman's voice (ゆき) of the Yomu stories
# (yomu/src/irodori_gen.py), on this Mac's GPU. Run by server/voice.ts in ~/Irodori-TTS/.venv; loads the model once.
# One JSON line in, {"text"}; one JSON line out, {"mp3": base64} or {"error"}. Nothing is kept on disk.
import base64, json, os, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "yomu" / "src"))
out = sys.stdout
sys.stdout = sys.stderr  # the libraries' prints stay off the reply line
import torch
from irodori_gen import CHARACTER_PROFILES, DEFAULT_CHECKPOINT, SamplingRequest, clean_audio_boundaries, get_runtime, save_wav

YUKI = CHARACTER_PROFILES["ゆき"]
STEPS = int(os.environ.get("VOICE_STEPS", 20))  # the stories used 30; 20 is quicker and sounds the same in a short line
runtime = get_runtime(DEFAULT_CHECKPOINT, "mps")


def speak(text: str) -> bytes:
    res = runtime.synthesize(SamplingRequest(text=text.strip().rstrip("。. \t\r\n"), caption=YUKI["caption"], ref_wav=YUKI["ref_wav"],
                                             seed=YUKI["seed"], num_steps=STEPS))
    audio = torch.from_numpy(clean_audio_boundaries(res.audio.squeeze().cpu().numpy(), runtime.codec.sample_rate)).unsqueeze(0)
    with tempfile.TemporaryDirectory() as tmp:
        wav, mp3 = os.path.join(tmp, "v.wav"), os.path.join(tmp, "v.mp3")
        save_wav(wav, audio, sample_rate=runtime.codec.sample_rate)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "96k", mp3], check=True)
        return Path(mp3).read_bytes()


out.write(json.dumps({"ready": True}) + "\n")
out.flush()
for line in sys.stdin:
    try:
        reply = {"mp3": base64.b64encode(speak(json.loads(line)["text"])).decode()}
    except Exception as e:
        reply = {"error": str(e)}
    out.write(json.dumps(reply) + "\n")
    out.flush()
