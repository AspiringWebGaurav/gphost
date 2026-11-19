import { chromium } from "playwright";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (process.env.ADMIN_EMAIL || "gauravpatil5737@gmail.com").trim().toLowerCase();

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
const supabaseAnon = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

async function run() {
  console.log("=== Step 1: Generating Supabase session for admin ===");
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: adminEmail,
  });
  if (linkErr) throw linkErr;

  const { data: sessionData, error: sessionErr } = await supabaseAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (sessionErr) throw sessionErr;

  const projectRef = supabaseUrl.split("//")[1].split(".")[0];
  const cookieBaseName = `sb-${projectRef}-auth-token`;
  const rawValue = "base64-" + Buffer.from(JSON.stringify(sessionData.session)).toString("base64url");

  const chunkSize = 2500;
  const cookiesToSet = [];
  if (rawValue.length > chunkSize) {
    let chunkIndex = 0;
    for (let i = 0; i < rawValue.length; i += chunkSize) {
      cookiesToSet.push({
        name: `${cookieBaseName}.${chunkIndex++}`,
        value: rawValue.slice(i, i + chunkSize),
        url: "http://localhost:3000/",
      });
    }
  } else {
    cookiesToSet.push({
      name: cookieBaseName,
      value: rawValue,
      url: "http://localhost:3000/",
    });
  }

  console.log("=== Step 2: Launching Playwright Chromium/Edge ===");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookiesToSet);

  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[CONSOLE] ${msg.text()}`);
  });
  const pageErrors = [];
  page.on("pageerror", (err) => {
    pageErrors.push(`[PAGE] ${err.toString()}`);
  });

  console.log("=== Step 3: Direct Load of http://localhost:3000/dashboard ===");
  const t0 = Date.now();
  await page.goto("http://localhost:3000/dashboard", { waitUntil: "domcontentloaded" });
  
  // Verify DOM is NOT blank immediately after DOMContentLoaded
  const initialBodyText = await page.evaluate(() => document.body.innerText.trim());
  const initialHtmlLen = await page.evaluate(() => document.body.innerHTML.length);
  console.log(`Direct load at domcontentloaded (${Date.now() - t0}ms): innerText length=${initialBodyText.length}, htmlLen=${initialHtmlLen}`);
  if (initialHtmlLen < 1000) {
    throw new Error(`CRITICAL: Page rendered almost empty body! Length: ${initialHtmlLen}`);
  }

  await page.waitForLoadState("networkidle");
  console.log(`Direct load networkidle (${Date.now() - t0}ms)`);
  await page.screenshot({ path: "pw_step1_direct_dashboard.png" });

  const hasSidebar = await page.locator("aside").isVisible();
  const hasHeading = await page.locator("h1:has-text('Dashboard')").isVisible();
  console.log(`Direct load assertions: hasSidebar=${hasSidebar}, hasDashboardHeading=${hasHeading}`);
  if (!hasSidebar || !hasHeading) {
    throw new Error("Direct load failed assertions!");
  }

  console.log("=== Step 4: Navigate to /files ===");
  await page.goto("http://localhost:3000/files", { waitUntil: "networkidle" });
  await page.screenshot({ path: "pw_step2_files_page.png" });
  const onFiles = page.url().includes("/files");
  console.log(`On files page: ${onFiles}`);

  console.log("=== Step 5: Click Overview (Dashboard link) and monitor for blank screen ===");
  const overviewBtn = page.locator('aside a[href="/dashboard"]').first();
  
  // Track DOM state every 50ms during navigation transition
  let wasBlank = false;
  let blankSamples = 0;
  const sampler = setInterval(async () => {
    try {
      const len = await page.evaluate(() => document.body.innerHTML.length);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (len < 500 || text.length < 50) {
        wasBlank = true;
        blankSamples++;
      }
    } catch {}
  }, 50);

  const navStart = Date.now();
  await overviewBtn.click();

  // Wait for Dashboard heading to be visible
  await page.waitForSelector("h1:has-text('Dashboard')", { timeout: 10000 });
  const navDuration = Date.now() - navStart;
  clearInterval(sampler);

  await page.screenshot({ path: "pw_step3_after_click_overview.png" });
  console.log(`Navigation click transition duration: ${navDuration}ms`);
  console.log(`Was screen ever blank during transition? wasBlank=${wasBlank}, blankSamples=${blankSamples}`);

  console.log("=== Step 6: Rapid Tab Switching Test ===");
  const tabs = [
    { name: "Files", selector: 'aside a[href="/files"]', heading: "File Manager" },
    { name: "Overview", selector: 'aside a[href="/dashboard"]', heading: "Dashboard" },
    { name: "Settings", selector: 'aside a[href="/settings"]', heading: "Account & Developer Settings" },
    { name: "Overview", selector: 'aside a[href="/dashboard"]', heading: "Dashboard" },
    { name: "Links", selector: 'aside a[href="/links"]', heading: "Shared Links" },
    { name: "Overview", selector: 'aside a[href="/dashboard"]', heading: "Dashboard" },
  ];

  let rapidSwitchBlanks = 0;
  for (const tab of tabs) {
    const tStart = Date.now();
    await page.locator(tab.selector).first().click();
    await page.waitForSelector(`text=${tab.heading}`, { timeout: 10000 });
    const dur = Date.now() - tStart;
    const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
    console.log(`  -> Switched to ${tab.name} in ${dur}ms (DOM length: ${bodyLen})`);
    if (bodyLen < 500) {
      rapidSwitchBlanks++;
    }
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: "pw_step4_final_rapid_switch.png" });

  console.log("=== TEST SUMMARY ===");
  console.log(`Console Errors (${consoleErrors.length}):`, consoleErrors);
  console.log(`Page Errors (${pageErrors.length}):`, pageErrors);
  console.log(`Blank screen detected during navigation: ${wasBlank}`);
  console.log(`Blank screens during rapid switching: ${rapidSwitchBlanks}`);

  await browser.close();

  if (wasBlank || rapidSwitchBlanks > 0 || pageErrors.length > 0) {
    console.error("FAIL: Blank screen or page error detected!");
    process.exit(1);
  } else {
    console.log("SUCCESS: Zero blank screens, seamless instant transitions verified!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Playwright Test Failed:", err);
  process.exit(1);
});
