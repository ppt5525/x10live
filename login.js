const axios = require('axios');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号 (环境变量 ACCOUNTS)');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔，格式 username:password
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s ? s.trim() : '');
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

async function sendTelegram(message) {
  if (!token || !chatId) return;
  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";
  const fullMessage = `🎉 x10hosting 登录通知\n\n登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败:', e.message);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function tryNavigateToLogin(page) {
  // 尝试一些常见的登录入口
  const candidates = [
    'https://x10hosting.com/login',
    'https://x10hosting.com/signin',
    'https://x10hosting.com/',
  ];
  for (const url of candidates) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      // 如果页面里有明显的登录按钮或表单就继续
      const body = await page.content();
      if (/login|sign in|client area|client login/i.test(body)) {
        return true;
      }
    } catch (e) {
      // ignore navigation error and try next
    }
  }
  // 也尝试在首页点击可能的登录入口
  try {
    if (await page.locator('text=Client Login').count() > 0) {
      await page.click('text=Client Login');
      await page.waitForLoadState('networkidle');
      return true;
    }
    if (await page.locator('text=Login').count() > 0) {
      await page.click('text=Login');
      await page.waitForLoadState('networkidle');
      return true;
    }
  } catch (e) {
    // ignore
  }
  return true; // 即使未检测到明显标识，仍继续尝试填写
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  ensureDir(screenshotsDir);

  let result = { user, success: false, message: '' };

  try {
    console.log(`📱 ${user} - 访问 x10hosting 登录页...`);
    await tryNavigateToLogin(page);
    await page.waitForTimeout(2000);

    // 尝试多种用户名/邮箱选择器
    const usernameSelectors = [
      'input[name="username"]',
      'input[name="user"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[type="text"]'
    ];

    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]'
    ];

    let filledUser = false;
    for (const sel of usernameSelectors) {
      try {
        if (await page.locator(sel).count() > 0) {
          console.log(`📝 ${user} - 填写用户名 (selector=${sel})`);
          await page.fill(sel, user);
          filledUser = true;
          break;
        }
      } catch (e) {}
    }

    let filledPass = false;
    for (const sel of passwordSelectors) {
      try {
        if (await page.locator(sel).count() > 0) {
          console.log(`🔒 ${user} - 填写密码 (selector=${sel})`);
          await page.fill(sel, pass);
          filledPass = true;
          break;
        }
      } catch (e) {}
    }

    if (!filledUser || !filledPass) {
      console.log(`⚠️ ${user} - 未找到合适的用户名/密码输入框，尝试在页面内搜索表单`);
      // 仍然尝试按回车或点击可能的提交按钮
    }

    // 尝试提交：优先点击按钮，然后回车
    const submitSelectors = [
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      'input[type="submit"]',
      'button[type="submit"]',
      'button:has-text("Log In")'
    ];

    let clickedSubmit = false;
    for (const sel of submitSelectors) {
      try {
        if (await page.locator(sel).count() > 0) {
          console.log(`📤 ${user} - 点击提交 (selector=${sel})`);
          await page.click(sel);
          clickedSubmit = true;
          break;
        }
      } catch (e) {}
    }

    if (!clickedSubmit) {
      // 回车提交
      try {
        console.log(`📤 ${user} - 通过回车提交表单`);
        await page.keyboard.press('Enter');
      } catch (e) {}
    }

    // 等待响应
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // 判断是否登录成功：查找常见关键字或用户名/登出按钮
    const content = await page.content();
    const lower = content.toLowerCase();

    const successIndicators = [
      'logout', 'sign out', 'client area', 'dashboard', 'my account', 'welcome'
    ];
    const usernameShown = user && lower.includes(user.toLowerCase());

    const matched = successIndicators.some(s => lower.includes(s));
    if (matched || usernameShown) {
      console.log(`✅ ${user} - 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      console.log(`❌ ${user} - 登录可能失败，保存页面截图以供调试`);
      const shotPath = path.join(screenshotsDir, `login-fail-${user.replace(/[^a-z0-9]/gi, '_')}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`📸 截图已保存: ${shotPath}`);
      result.message = `❌ ${user} 登录失败（截图: ${shotPath}）`;
    }

  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    const shotPath = path.join(process.cwd(), 'screenshots', `error-${user.replace(/[^a-z0-9]/gi, '_')}.png`);
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`📸 异常时截图已保存: ${shotPath}`);
    } catch (err) {}
    result.message = `❌ ${user} 登录异常: ${e.message}`;
  } finally {
    try { await page.close(); } catch (e) {}
    try { await context.close(); } catch (e) {}
    await browser.close();
  }

  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  const results = [];

  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    const result = await loginWithAccount(user, pass);
    results.push(result);

    if (i < accountList.length - 1) {
      console.log('⏳ 等待3秒后处理下一个账号...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // 汇总并发送
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  let summaryMessage = `📊 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });

  await sendTelegram(summaryMessage);
  console.log('\n✅ 所有账号处理完成！');
}

main().catch(async (e) => {
  console.error('脚本执行异常:', e);
  try { await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text: `登录脚本异常: ${e.message}` }); } catch (_) {}
  process.exit(1);
});
