const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: {
    user: '3877443647@qq.com',
    pass: 'auaucqkeimwfcedj'
  }
});

app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: '缺少邮箱' });
  
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('收到请求，验证码是:', code);
  
  try {
    await transporter.sendMail({
      from: '"Csuru" <3877443647@qq.com>',
      to: email,
      subject: 'Csuru - 验证码',
      html: `<h2>您的验证码是：${code}</h2>`
    });
    console.log('发送成功');
    res.json({ success: true, code: code });
  } catch (error) {
    console.error('发送失败', error);
    res.status(500).json({ success: false, message: '发送失败' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('后端启动成功！端口 3000');
});
