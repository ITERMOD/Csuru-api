require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors()); 
app.use(express.json());

// ==========================================
// Supabase 配置 (直接使用你前端代码里的配置)
// ==========================================
const SUPABASE_URL = 'https://mxjizcapzpqiyjqmvffg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wLes19TCgX6PHAOhNIwN6g_N7HMuVlQ';

// 封装一个请求 Supabase 的工具函数
async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    }
  });
  return res.json();
}

// ==========================================
// 验证码内存存储
// ==========================================
const codeStore = new Map();   
const coolStore = new Map();   

// ==========================================
// 发邮件功能（Resend API）
// ==========================================
async function sendMail(to, subject, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Csuru <onboarding@resend.dev>', // 注意：免费版只能发给你注册Resend的邮箱
      to: [to],
      subject,
      html
    })
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Resend 发送失败 (${r.status})`);
  }
  return r.json();
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const genCode = () => String(crypto.randomInt(100000, 999999));

// ==========================================
// 1. 发送验证码接口
// ==========================================
app.post('/api/send-code', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ success: false, message: '邮箱格式不正确' });

    const now = Date.now();
    const coolExp = coolStore.get(email);
    if (coolExp && now < coolExp) {
      const left = Math.ceil((coolExp - now) / 1000);
      return res.status(429).json({ success: false, message: `请 ${left} 秒后再试` });
    }

    const code = genCode();
    codeStore.set(email, { code, exp: now + 600_000 }); 
    coolStore.set(email, now + 60_000);

    console.log(`\n[发送验证码] 邮箱: ${email}, 验证码: ${code}\n`);

    await sendMail(
      email,
      '【Csuru】您的注册验证码',
      `<div style="font-family:sans-serif;padding:20px;">
        <h2>Csuru 验证码</h2>
        <p>您的验证码是：<b style="font-size:24px;color:blue;">${code}</b></p>
        <p>10 分钟内有效。</p>
      </div>`
    );

    res.json({ success: true, message: '验证码已发送' });
  } catch (e) {
    console.error('[发送失败]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================
// 2. 注册接口（写入 Supabase）
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '');

    const rec = codeStore.get(email);
    if (!rec) return res.status(400).json({ success: false, message: '验证码已过期' });
    if (rec.code !== code) return res.status(400).json({ success: false, message: '验证码错误' });

    codeStore.delete(email); 

    // 检查是否已存在
    const existing = await supabaseFetch(`users?email=eq.${email}`, { method: 'GET' });
    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, message: '该邮箱已被注册' });
    }

    // 写入数据库 (默认 active 状态，0积分)
    await supabaseFetch('users', {
      method: 'POST',
      body: JSON.stringify({ email, password, balance: 0, status: 'active' })
    });

    console.log(`\n[注册成功] 已存入数据库: ${email}\n`);
    res.json({ success: true, message: '注册成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================
// 3. 登录接口（校验封禁状态）
// ==========================================
app.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const users = await supabaseFetch(`users?email=eq.${email}`, { method: 'GET' });
    if (!users || users.length === 0) {
      return res.status(400).json({ success: false, message: '账号不存在' });
    }

    const user = users[0];
    if (user.password !== password) {
      return res.status(400).json({ success: false, message: '密码错误' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: '该账号已被封禁' });
    }

    res.json({ success: true, message: '登录成功', user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================
// 4. 管理员接口：获取所有用户列表
// ==========================================
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await supabaseFetch('users?select=*&order=created_at.desc', { method: 'GET' });
    res.json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================
// 5. 管理员接口：封禁/解封用户
// ==========================================
app.post('/api/admin/ban', async (req, res) => {
  try {
    const { email, status } = req.body;
    if (!email || !['active', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    await supabaseFetch(`users?email=eq.${email}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    res.json({ success: true, message: status === 'banned' ? '已封禁' : '已解封' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================
// 6. 管理员接口：发送单发通知邮件
// ==========================================
app.post('/api/admin/send-mail', async (req, res) => {
  try {
    const { email, subject, content } = req.body;
    if (!email || !subject || !content) return res.status(400).json({ success: false, message: '参数不完整' });

    await sendMail(
      email,
      subject,
      `<div style="font-family:sans-serif;padding:20px;">
        <h2>${subject}</h2>
        <p>${content}</p>
      </div>`
    );

    res.json({ success: true, message: '邮件已发送' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==========================================
// 启动服务器
// ==========================================
app.listen(3000, () => console.log(`🚀 后端已启动: http://localhost:3000`));
