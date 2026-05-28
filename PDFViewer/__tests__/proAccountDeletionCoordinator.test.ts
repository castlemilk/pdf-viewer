import {createProAccountDeletionCoordinator} from '../src/pro/proAccountDeletionCoordinator';

test('revokes Apple token before deleting backend and native account', async () => {
  const getIDToken = jest.fn(async () => 'firebase-token');
  const requestAppleAuthorizationCode = jest.fn(async () => 'apple-auth-code');
  const revokeAppleSignInToken = jest.fn(async () => ({revoked: true}));
  const deleteAccount = jest.fn(async () => ({deleted: true}));
  const deleteFirebaseAccount = jest.fn(async () => {});
  const coordinator = createProAccountDeletionCoordinator({
    authTokenProvider: {getIDToken},
    backendClient: {deleteAccount, revokeAppleSignInToken},
    appleAuthorizationCodeProvider: {requestAppleAuthorizationCode},
    nativeAccountDeleter: {deleteFirebaseAccount},
  });

  await expect(coordinator.deleteAccount()).resolves.toEqual({deleted: true});

  expect(requestAppleAuthorizationCode).toHaveBeenCalledTimes(1);
  expect(revokeAppleSignInToken).toHaveBeenCalledWith(
    'firebase-token',
    'apple-auth-code',
  );
  expect(deleteAccount).toHaveBeenCalledWith('firebase-token');
  expect(deleteFirebaseAccount).toHaveBeenCalledTimes(1);
});
