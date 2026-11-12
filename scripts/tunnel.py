"""
Cloudflare Quick Tunnel Launcher for Mobile Live Preview.
Spawns cloudflared tunnel against the local development/production port
and extracts the public HTTPS URL.
"""
import os
import re
import subprocess
import sys
import time

def start_tunnel(port: int = 8000):
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [npx_cmd, "--yes", "cloudflared", "tunnel", "--url", f"http://localhost:{port}"]
    print(f"[*] Starting Cloudflare tunnel to http://localhost:{port}...", flush=True)
    
    # Run cloudflared; it logs tunnel connection details to stderr
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    
    tunnel_url = None
    pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    
    start_time = time.time()
    # Read output line-by-line until the trycloudflare URL appears
    while time.time() - start_time < 30:
        line = proc.stderr.readline()
        if not line and proc.poll() is not None:
            break
        if line:
            match = pattern.search(line)
            if match:
                tunnel_url = match.group(0)
                break
                
    if tunnel_url:
        print(f"\n[+] LIVE PREVIEW READY: {tunnel_url}")
        print(f"[*] Open this link on your phone browser to preview the app.\n")
        # Keep process alive so tunnel doesn't close
        try:
            proc.wait()
        except KeyboardInterrupt:
            proc.terminate()
    else:
        print("[-] Failed to extract tunnel URL within 30 seconds.")
        proc.terminate()
        sys.exit(1)

if __name__ == "__main__":
    target_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    start_tunnel(target_port)

