const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: '缺少邮箱' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('收到请求，验证码是:', code);

  try {
    // 调用 Resend 的 HTTP API 发信
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer re_UUpLTAY7_CNPTwncNqPAKdT9qRgVd8XPK',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'Csuru - 验证码',
        html: `<h2>您的验证码是：${code}</h2>`
      })
    });

    if (!response.ok) throw new Error('Resend API 返回错误');
    
    console.log('发送成功');
    res.json({ success: true, code: code });
  } catch (error) {
    console.error('发送失败', error.message);
    res.status(500).json({ success: false, message: '发送失败' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`后端启动成功！端口 ${PORT}`);
});
