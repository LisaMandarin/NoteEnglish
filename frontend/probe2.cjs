const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("http://localhost:5199/");
  await page.evaluate(() => {
    localStorage.setItem("latestSummary", JSON.stringify({
      createdAt: Date.now(), sessionTitle: "t", includeTranslation: false,
      includeVocab: false, includeNote: true,
      rows: [{ idx: 0, original: "O.", translation: "", note: '<p><a href="https://example.com/a">L</a></p>', vocab: [] }],
    }));
  });
  await page.goto("http://localhost:5199/?view=summary");
  await page.waitForSelector(".note-content a");
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const a = document.querySelector(".note-content a");
    const probe = document.createElement("a");
    probe.href = "https://x.example";
    probe.textContent = "probe";
    document.querySelector(".note-content").appendChild(probe);
    return {
      afterWait: getComputedStyle(a).color,
      probeColor: getComputedStyle(probe).color,
      transition: getComputedStyle(a).transitionProperty + " " + getComputedStyle(a).transitionDuration,
    };
  });
  console.log("PROBE", JSON.stringify(r));
  await browser.close();
})();
