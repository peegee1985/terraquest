import type { FunctionReference } from 'convex/server';
import { useMutation, useQuery } from 'convex/react';
import { File } from 'expo-file-system';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

export type AvatarChangeResult = { ok: true } | { ok: false; reason: 'guests_cannot_change_avatar' | 'limit_reached' };

export type AvatarChangeStatus = { isGuest: boolean; isVip: boolean; changesUsed: number; changesAllowed: number };

type GenerateAvatarUploadUrlMutation = FunctionReference<'mutation', 'public', Record<string, never>, string>;
type SetAvatarPhotoMutation = FunctionReference<'mutation', 'public', { storageId: string }, AvatarChangeResult>;
type SetAvatarPresetMutation = FunctionReference<'mutation', 'public', { avatarId: string }, AvatarChangeResult>;
type GetMyAvatarChangeStatusQuery = FunctionReference<'query', 'public', Record<string, never>, AvatarChangeStatus | null>;

const generateAvatarUploadUrlRef = clientFunctionReference<GenerateAvatarUploadUrlMutation>('avatar:generateAvatarUploadUrl');
const setAvatarPhotoRef = clientFunctionReference<SetAvatarPhotoMutation>('avatar:setAvatarPhoto');
const setAvatarPresetRef = clientFunctionReference<SetAvatarPresetMutation>('avatar:setAvatarPreset');
const getMyAvatarChangeStatusRef =
  clientFunctionReference<GetMyAvatarChangeStatusQuery>('avatar:getMyAvatarChangeStatus');

export function useGenerateAvatarUploadUrl() {
  return useMutation(generateAvatarUploadUrlRef);
}

export function useSetAvatarPhoto() {
  return useMutation(setAvatarPhotoRef);
}

export function useSetAvatarPreset() {
  return useMutation(setAvatarPresetRef);
}

/** Mirrors useMyHandleChangeStatus — drives the avatar picker's remaining-changes/disabled state. */
export function useMyAvatarChangeStatus(): AvatarChangeStatus | null | undefined {
  return useQuery(getMyAvatarChangeStatusRef, {});
}

/**
 * Uploads a local photo (a file:// URI from expo-image-picker) to the
 * one-time URL Convex file storage hands out, then tells the profile to
 * point at the resulting storageId. Two round trips (generate URL, then
 * PUT the bytes) is Convex file storage's standard upload flow — there's
 * no single-call "upload and attach" API. Returns setAvatarPhoto's result
 * so the caller can show the same guest/limit-reached messaging the
 * preset picker shows.
 *
 * Uses expo-file-system's native upload (not fetch(localUri).blob()) —
 * React Native's Blob support for local file:// URIs is unreliable on
 * Android (bodies can come out empty/truncated), which is exactly what
 * was producing the "status 400" Convex storage was rejecting. Convex's
 * own docs point at expo-file-system for this reason: it streams the file
 * bytes natively instead of going through RN's Blob polyfill.
 */
export async function uploadAvatarPhoto(
  localUri: string,
  generateUploadUrl: () => Promise<string>,
  setAvatarPhoto: (args: { storageId: string }) => Promise<AvatarChangeResult>,
  mimeType = 'image/jpeg',
): Promise<AvatarChangeResult> {
  const uploadUrl = await generateUploadUrl();
  const result = await new File(localUri).upload(uploadUrl, {
    httpMethod: 'POST',
    headers: { 'Content-Type': mimeType },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Avatar upload failed with status ${result.status}`);
  }
  const { storageId } = JSON.parse(result.body) as { storageId: string };
  return setAvatarPhoto({ storageId });
}
