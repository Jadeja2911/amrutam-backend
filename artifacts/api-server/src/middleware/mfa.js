const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setupMfa(req, res) {
  try {
    const secret = speakeasy.generateSecret({ name: `Amrutam (${req.user.email})` });
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { mfaSecret: secret.base32 },
    });
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qrCode: qrDataUrl, secret: secret.base32 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyMfaSetup(req, res) {
  try {
    const { token } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user || !user.mfaSecret) {
      return res.status(400).json({ error: 'MFA setup not started' });
    }
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!verified) {
      return res.status(400).json({ error: 'Invalid MFA code' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    res.json({ mfaEnabled: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

function verifyMfaToken(mfaSecret, token) {
  return speakeasy.totp.verify({ secret: mfaSecret, encoding: 'base32', token, window: 1 });
}

module.exports = { setupMfa, verifyMfaSetup, verifyMfaToken };
