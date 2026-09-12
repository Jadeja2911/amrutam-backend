const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();
const allowedRoles = new Set(['PATIENT', 'DOCTOR', 'ADMIN']);

router.post('/signup', async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password || !role) {
    return res.status(400).json({
      error: 'email, password, and role are required',
    });
  }

  if (!allowedRoles.has(role)) {
    return res.status(400).json({
      error: 'role must be PATIENT, DOCTOR, or ADMIN',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
      },
    });

    return res.status(201).json(user);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      jwtSecret,
      { expiresIn: '24h' },
    );

    return res.status(200).json({ token });
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
});

module.exports = router;