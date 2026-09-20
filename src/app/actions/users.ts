'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import { recordAudit } from '@/lib/repo/audit';
import { createUser, setUserActive, setUserPassword, updateUserProfile, getUserById } from '@/lib/repo/users';
import { destroyAllSessionsForUser } from '@/lib/auth/session';
import type { ActionResult } from './leads';

const ok = (message: string): ActionResult => ({ ok: true, error: null, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
  role: z.enum(['admin', 'member']),
});

export async function createUserAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  if (actor.role !== 'admin') return fail('Only an administrator can add users.');

  const parsed = CreateSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
  });
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(' '));

  try {
    const user = await createUser(parsed.data);
    recordAudit({ userId: actor.id, action: 'user.created', entityType: 'user', entityId: user.id, detail: { role: user.role } });
    revalidatePath('/settings');
    return ok(`${user.name} can now sign in.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The user could not be created.');
  }
}

export async function setUserActiveAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  if (actor.role !== 'admin') return fail('Only an administrator can change user access.');

  const userId = String(formData.get('userId') ?? '');
  const active = formData.get('active') === '1';
  if (userId === actor.id && !active) return fail('You cannot deactivate your own account.');

  try {
    setUserActive(userId, active);
    if (!active) destroyAllSessionsForUser(userId);
    recordAudit({ userId: actor.id, action: active ? 'user.activated' : 'user.deactivated', entityType: 'user', entityId: userId });
    revalidatePath('/settings');
    return ok(active ? 'User reactivated.' : 'User deactivated and signed out everywhere.');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The change could not be saved.');
  }
}

export async function updateUserAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  if (actor.role !== 'admin') return fail('Only an administrator can edit users.');

  const userId = String(formData.get('userId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? '');
  if (!name) return fail('A name is required.');
  if (role !== 'admin' && role !== 'member') return fail('Unknown role.');
  if (userId === actor.id && role !== 'admin') return fail('You cannot remove your own administrator rights.');

  updateUserProfile(userId, name, role);
  recordAudit({ userId: actor.id, action: 'user.updated', entityType: 'user', entityId: userId, detail: { role } });
  revalidatePath('/settings');
  return ok('User updated.');
}

export async function changePasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireUser();
  const userId = String(formData.get('userId') ?? '') || actor.id;
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (userId !== actor.id && actor.role !== 'admin') {
    return fail('Only an administrator can change another user’s password.');
  }
  if (password !== confirm) return fail('The two passwords do not match.');
  if (!getUserById(userId)) return fail('User not found.');

  try {
    await setUserPassword(userId, password);
    // Changing a password ends every other session for that account.
    destroyAllSessionsForUser(userId);
    recordAudit({ userId: actor.id, action: 'user.password_changed', entityType: 'user', entityId: userId });
    revalidatePath('/settings');
    return ok('Password changed. All sessions for that account were signed out.');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The password could not be changed.');
  }
}
