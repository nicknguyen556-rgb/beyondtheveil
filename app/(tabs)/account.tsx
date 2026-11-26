import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { OnboardingHint } from '@/components/OnboardingHint';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useSync } from '@/sync';
import { colors } from '@/theme/colors';
import type { Entitlement } from '@/types/models';

function formatTs(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AccountScreen() {
  const {
    configured,
    user,
    entitlement,
    lastSyncAt,
    lastSummary,
    syncStatus,
    busy,
    authError,
    signIn,
    signUp,
    signOutUser,
    setEntitlement,
    syncNow,
    formatMergeLine,
  } = useSync();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [statusLine, setStatusLine] = useState<string | null>(null);

  async function onSignIn() {
    const ok = await signIn(email, password);
    setStatusLine(ok ? 'Signed in.' : null);
  }

  async function onSignUp() {
    const ok = await signUp(email, password);
    setStatusLine(ok ? 'Account ready.' : null);
  }

  async function onSync() {
    const summary = await syncNow();
    if (!summary) {
      setStatusLine('Local store not ready.');
      return;
    }
    if (summary.skippedReason) {
      setStatusLine(summary.skippedReason);
      return;
    }
    setStatusLine(
      `Synced · pushed ${summary.pushed}, pulled ${summary.pulled}, kept local ${summary.keptLocal}, identical ${summary.identical}` +
        (summary.pendingCount > 0
          ? ` · ${summary.pendingCount} still queued`
          : '') +
        (summary.offline ? ' (partial / offline)' : ''),
    );
  }

  async function toggleEntitlement() {
    const next: Entitlement = entitlement === 'premium' ? 'free' : 'premium';
    await setEntitlement(next);
    setStatusLine(
      next === 'premium'
        ? 'Premium enabled locally — sync + AI suggestions unlocked.'
        : 'Free plan — local-only; cloud sync and AI suggestions disabled.',
    );
  }

  return (
    <Screen
      title="Account"
      subtitle="Free stays on-device. Premium unlocks optional cloud sync and AI trend hints."
    >
      <OnboardingHint label="Privacy">
        Capture, enrich, and chart without an account. Nothing leaves this phone on the
        free plan.
      </OnboardingHint>

      {!configured ? (
        <EmptyState
          eyebrow="Local-only"
          title="Cloud sync is optional"
          body="You can journal fully offline. To enable premium sync later, add Supabase URL and anon key in .env (see docs/LOCAL_SETUP.md) and restart Metro."
        />
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>Status</Text>
        <Text style={styles.body}>
          {configured
            ? 'Supabase is configured — sign in below when you want sync.'
            : 'Running local-only. Capture and Trends work without this tab.'}
        </Text>
        <Text style={styles.hint}>
          Plan: {entitlement === 'premium' ? 'Premium' : 'Free (local-only)'}
          {user ? ` · signed in as ${user.email ?? user.id}` : ' · not signed in'}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>Entitlement</Text>
        <Text style={styles.body}>
          Free never uploads. Premium unlocks cloud sync and AI suggestions on Trends
          (same gate for both).
        </Text>
        <PrimaryButton
          label={
            entitlement === 'premium'
              ? 'Switch to free (local-only)'
              : 'Enable premium (local flag)'
          }
          onPress={() => void toggleEntitlement()}
          disabled={busy}
        />
        <Text style={styles.hint}>
          Local flag until real IAP. Remote profiles.entitlement overrides when reachable.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>Sign in</Text>
        {!configured ? (
          <Text style={styles.body}>
            Sign-in appears once Supabase keys are set. Until then, keep capturing locally.
          </Text>
        ) : user ? (
          <>
            <Text style={styles.body}>Signed in as {user.email ?? user.id}</Text>
            <PrimaryButton
              label={busy ? 'Working…' : 'Sign out'}
              onPress={() => void signOutUser()}
              disabled={busy}
            />
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Optional — only needed for premium cloud sync across devices.
            </Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
            <PrimaryButton
              label={busy ? 'Working…' : 'Sign in'}
              onPress={() => void onSignIn()}
              disabled={busy || !email || !password}
            />
            <Pressable
              onPress={() => void onSignUp()}
              disabled={busy || !email || !password}
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>Create account</Text>
            </Pressable>
          </>
        )}
        {authError ? <Text style={styles.error}>{authError}</Text> : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>Sync</Text>
        <Text style={styles.body}>{syncStatus.message}</Text>
        <Text style={styles.hint}>
          Last sync: {formatTs(lastSyncAt)}
          {syncStatus.pendingCount > 0
            ? ` · ${syncStatus.pendingCount} observation${
                syncStatus.pendingCount === 1 ? '' : 's'
              } queued`
            : ''}
          . Retries on reconnect and when the app comes to the foreground. Free
          stays local-only. Conflicts use last-write-wins per observation
          (updated_at).
        </Text>
        <PrimaryButton
          label={
            busy
              ? 'Syncing…'
              : syncStatus.pendingCount > 0
                ? `Sync now (${syncStatus.pendingCount} queued)`
                : 'Sync now'
          }
          onPress={() => void onSync()}
          disabled={busy || !configured || entitlement !== 'premium'}
        />
        {statusLine ? <Text style={styles.hint}>{statusLine}</Text> : null}
        {syncStatus.lastError && syncStatus.kind !== 'local_only' ? (
          <Text style={styles.error}>{syncStatus.lastError}</Text>
        ) : null}
        {lastSummary && lastSummary.merges.length > 0 ? (
          <View style={styles.mergeBox}>
            <Text style={styles.mergeTitle}>Merge decisions</Text>
            {lastSummary.merges.slice(0, 12).map((m) => (
              <Text key={m.observationId} style={styles.mergeLine}>
                {formatMergeLine(m)}
              </Text>
            ))}
            {lastSummary.merges.length > 12 ? (
              <Text style={styles.hint}>
                +{lastSummary.merges.length - 12} more
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  error: {
    fontSize: 14,
    color: colors.danger,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  mergeBox: {
    gap: 4,
    paddingTop: 4,
  },
  mergeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  mergeLine: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    fontFamily: 'monospace',
  },
});
