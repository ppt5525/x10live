const axios = require('axios');
const { chromium } = require('playwright');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
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

  const fullMessage = `🎉 X10Hosting 登录通知\n\n登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败');
  }
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let page;
  let result = { user, success: false, message: '' };
  
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(45000); // 增加超时时间
    
    // 设置用户代理，避免被检测为机器人
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`📱 ${user} - 正在访问 X10Hosting 网站...`);
    await page.goto('https://x10hosting.com/login', { 
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // 等待登录表单加载
    console.log(`🔍 ${user} - 等待登录表单...`);
    await page.waitForSelector('input[name="username"], input[name="email"], input[type="email"]', { timeout: 10000 });
    
    // 尝试不同的用户名输入框选择器
    console.log(`📝 ${user} - 填写用户名/邮箱...`);
    const usernameSelectors = [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]'
    ];
    
    let usernameFilled = false;
    for (const selector of usernameSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await page.fill(selector, user);
          usernameFilled = true;
          console.log(`✅ ${user} - 使用选择器 ${selector} 填写用户名`);
          break;
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }
    
    if (!usernameFilled) {
      // 如果所有选择器都失败，尝试第一个文本输入框
      const textInputs = await page.$$('input[type="text"]');
      if (textInputs.length > 0) {
        await textInputs[0].fill(user);
        usernameFilled = true;
        console.log(`✅ ${user} - 使用第一个文本输入框填写用户名`);
      }
    }
    
    if (!usernameFilled) {
      throw new Error('找不到用户名输入框');
    }
    
    await page.waitForTimeout(1000);
    
    // 填写密码
    console.log(`🔒 ${user} - 填写密码...`);
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="password" i]'
    ];
    
    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await page.fill(selector, pass);
          passwordFilled = true;
          console.log(`✅ ${user} - 使用选择器 ${selector} 填写密码`);
          break;
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }
    
    if (!passwordFilled) {
      throw new Error('找不到密码输入框');
    }
    
    await page.waitForTimeout(1000);
    
    // 点击登录按钮
    console.log(`📤 ${user} - 提交登录...`);
    const loginButtonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      'input[value*="Login" i]',
      'input[value*="Sign" i]'
    ];
    
    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        await page.click(selector, { timeout: 5000 });
        loginClicked = true;
        console.log(`✅ ${user} - 使用选择器 ${selector} 点击登录`);
        break;
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }
    
    if (!loginClicked) {
      // 如果所有选择器都失败，尝试点击包含登录文本的任何按钮
      const buttons = await page.$$('button, input[type="button"]');
      for (const button of buttons) {
        const text = await button.textContent();
        if (text && text.toLowerCase().includes('login')) {
          await button.click();
          loginClicked = true;
          break;
        }
      }
    }
    
    // 等待登录完成
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(8000);
    
    // 检查登录是否成功
    const currentUrl = page.url();
    const pageContent = await page.content();
    
    // 成功登录的指标
    const successIndicators = [
      'dashboard',
      'account',
      'control panel',
      'welcome',
      'logout',
      'my account'
    ];
    
    const failureIndicators = [
      'invalid',
      'error',
      'incorrect',
      'login failed'
    ];
    
    let loginSuccess = false;
    
    // 检查URL是否包含成功指标
    if (successIndicators.some(indicator => currentUrl.toLowerCase().includes(indicator))) {
      loginSuccess = true;
    }
    
    // 检查页面内容是否包含成功指标
    if (successIndicators.some(indicator => pageContent.toLowerCase().includes(indicator))) {
      loginSuccess = true;
    }
    
    // 检查是否仍然在登录页面
    if (currentUrl.includes('login') && !loginSuccess) {
      loginSuccess = false;
    }
    
    // 检查失败指标
    if (failureIndicators.some(indicator => pageContent.toLowerCase().includes(indicator))) {
      loginSuccess = false;
    }
    
    if (loginSuccess) {
      console.log(`✅ ${user} - 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      console.log(`❌ ${user} - 登录失败，当前URL: ${currentUrl}`);
      
      // 保存截图用于调试
      await page.screenshot({ path: `debug-${user.replace(/[^a-zA-Z0-9]/g, '_')}.png` });
      result.message = `❌ ${user} 登录失败 - 可能凭据错误或网站结构变化`;
    }
    
  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
    
    // 保存截图用于调试
    if (page) {
      try {
        await page.screenshot({ path: `error-${user.replace(/[^a-zA-Z0-9]/g, '_')}.png` });
      } catch (screenshotError) {
        console.log('无法保存截图');
      }
    }
  } finally {
    if (page) await page.close();
    await browser.close();
  }
  
  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个 X10Hosting 账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    // 如果不是最后一个账号，等待一下再处理下一个
    if (i < accountList.length - 1) {
      console.log('⏳ 等待5秒后处理下一个账号...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // 汇总所有结果并发送一条消息
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 X10Hosting 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });
  
  await sendTelegram(summaryMessage);
  
  console.log('\n✅ 所有 X10Hosting 账号处理完成！');
}

main().catch(console.error);