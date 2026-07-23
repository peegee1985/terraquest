import type { FunctionReference } from 'convex/server';
import { useMutation } from 'convex/react';

function clientFunctionReference<F extends FunctionReference<'query' | 'mutation'>>(name: string): F {
  return { [Symbol.for('functionName')]: name } as unknown as F;
}

type GenerateAvatarUploadUrlMutation = FunctionReference<'mutation', 'public', Record<string, never>, string>;
type SetAvatarPhotoMutation = FunctionReference<'mutation', 'public', { storageId: string }, null>;
type SetAvatarPresetMutation = FunctionReference<'mutation', 'public', { avatarId: string }, null>;

const generateAvatarUploadUrlRef = clientFunctionReference<GenerateAvatarUploadUrlMutation>('avatar:generateAvatarUploadUrl');
const setAvatarPhotoRef = clientFunctionReference<SetAvatarPhotoMutation>('avatar:setAvatarPhoto');
const setAvatarPresetRef = clientFunctionReference<SetAvatarPresetMutation>('avatar:setAvatarPreset');

export function useGenerateAvatarUploadUrl() {
  return useMutation(generateAvatarUploadUrlRef);
}

export function useSetAvatarPhoto() {
  return useMutation(setAvatarPhotoRef);
}

export function useSetAvatarPreset() {
  return useMutation(setAvatarPresetRef);
}

/**
 * Uploads a local photo (a file:// URI from expo-image-picker) to the
 * one-time URL Convex file storage hands out, then tells the profile to
 * point at the resulting storageId. Two round trips (generate URL, then
 * PUT the bytes) is Convex file storage's standard upload flow — there's
 * no single-call "upload and attach" API.
 */
export async function uploadAvatarPhoto(
  localUri: string,
  generateUploadUrl: () => Promise<string>,
  setAvatarPhoto: (args: { storageId: string }) => Promise<null>,
): Promise<void> {
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(localUri);
  const blob = await response.blob();
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });
  if (!uploadResponse.ok) throw new Error(`Avatar upload failed with status ${uploadResponse.status}`);
  const { storageId } = (await uploadResponse.json()) as { storageId: string };
  await setAvatarPhoto({ storageId });
}
