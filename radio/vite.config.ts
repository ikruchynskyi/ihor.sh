import { defineConfig } from "vite";

// The app, the overview explainer, the course chapters, and the license track.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: "index.html", course: "course/index.html", learn: "learn.html", build: "build.html", hello: "examples/hello-dongle.html", ch01: "course/01-spinning-arrows.html", ch02: "course/02-arrows-as-numbers.html", ch03: "course/03-taking-snapshots.html", ch04: "course/04-winding-machine.html", ch05: "course/05-moving-a-station.html", ch06: "course/06-averaging-is-filtering.html", ch07: "course/07-throwing-away-snapshots.html", ch08: "course/08-chunks-of-a-live-stream.html", ch09: "course/09-fm-listening-to-the-speed.html", ch10: "course/10-am-ssb-and-morse.html", ch11: "course/11-numbers-to-speakers.html", ch12: "course/12-inside-the-dongle.html", ch13: "course/13-usb-from-zero.html", ch14: "course/14-writing-the-driver.html", ch15: "course/15-the-network-source.html", ch16: "course/16-the-whole-receiver.html", ham: "ham/index.html", hamPractice: "ham/practice.html", hamL01: "ham/lessons/01-volts-amps-ohms.html", hamL02: "ham/lessons/02-decibels-and-prefixes.html", hamL03: "ham/lessons/03-capacitors-and-inductors.html", hamL04: "ham/lessons/04-resonance.html" },
    },
  },
});
