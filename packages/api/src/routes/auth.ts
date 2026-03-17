import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import prisma from '../lib/prisma';
import { requireAuth, clearAuthCache } from '../middleware/auth';

const router = Router();

// ─── POST /auth/login ────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    // Look up the user in Prisma
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        isActive: true,
        teamId: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Usuário inativo ou não encontrado no sistema' });
    }

    return res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user,
    });
  } catch (err) {
    console.error('[auth/login] Error:', err);
    return res.status(500).json({ error: 'Erro interno no login' });
  }
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  // Invalidate cached token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    clearAuthCache(authHeader.slice(7));
  }
  return res.json({ message: 'Logout realizado com sucesso' });
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        isActive: true,
        teamId: true,
        team: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json(user);
  } catch (err) {
    console.error('[auth/me] Error:', err);
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// ─── POST /auth/change-password ──────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Nova senha é obrigatória' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    // Verify current password by attempting sign-in
    if (currentPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: req.user!.email,
        password: currentPassword,
      });

      if (signInError) {
        return res.status(401).json({ error: 'Senha atual incorreta' });
      }
    }

    // Update password in Supabase
    // Note: with service key, admin.updateUserById works; with anon key, we use the user's token
    const token = req.headers.authorization?.slice(7);
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    // Use the user's own session to update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      (await supabase.auth.getUser(token)).data.user!.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('[auth/change-password] Supabase error:', updateError);
      return res.status(500).json({ error: 'Erro ao alterar senha no Supabase' });
    }

    return res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('[auth/change-password] Error:', err);
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

export default router;
