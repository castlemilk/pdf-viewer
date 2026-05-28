export {};

declare const __dirname: string;
declare const require: (module: string) => {
  readFileSync?: (path: string, encoding: string) => string;
  resolve?: (...paths: string[]) => string;
  join?: (...paths: string[]) => string;
};

const fs = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
const path = require('path') as {
  resolve: (...paths: string[]) => string;
  join: (...paths: string[]) => string;
};

const root = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('iOS StoreKit bridge passes backend appAccountToken and returns signed transaction JWS', () => {
  const swift = read('ios/PDFViewer/AcaciaStoreKit.swift');
  const bridge = read('ios/PDFViewer/AcaciaStoreKitBridge.m');
  const project = read('ios/PDFViewer.xcodeproj/project.pbxproj');

  expect(swift).toContain('Product.PurchaseOption.appAccountToken');
  expect(swift).toContain('verification.jwsRepresentation');
  expect(swift).toContain('Transaction.currentEntitlements');
  expect(swift).toContain('restorePro');
  expect(swift).toContain('ACACIA_STOREKIT_TEST_SIGNED_JWS');
  expect(swift).toContain('PDFVIEWER_PRO_PURCHASE_TESTING');
  expect(bridge).toContain('RCT_EXTERN_MODULE(AcaciaStoreKit, NSObject)');
  expect(bridge).toContain('RCT_EXTERN_METHOD(restorePro');
  expect(project).toContain('AcaciaStoreKit.swift');
  expect(project).toContain('AcaciaStoreKitBridge.m');
});

test('macOS StoreKit bridge is included in the app target', () => {
  const swift = read('macos/PDFViewer-macOS/AcaciaStoreKit.swift');
  const bridge = read('macos/PDFViewer-macOS/AcaciaStoreKitBridge.m');
  const project = read('macos/Acacia.xcodeproj/project.pbxproj');

  expect(swift).toContain('Product.PurchaseOption.appAccountToken');
  expect(swift).toContain('verification.jwsRepresentation');
  expect(swift).toContain('Transaction.currentEntitlements');
  expect(swift).toContain('restorePro');
  expect(swift).toContain('ACACIA_STOREKIT_TEST_SIGNED_JWS');
  expect(swift).toContain('PDFVIEWER_PRO_PURCHASE_TESTING');
  expect(bridge).toContain('RCT_EXTERN_MODULE(AcaciaStoreKit, NSObject)');
  expect(bridge).toContain('RCT_EXTERN_METHOD(restorePro');
  expect(project).toContain('AcaciaStoreKit.swift');
  expect(project).toContain('AcaciaStoreKitBridge.m');
});

test('iOS Pro config and auth bridges expose backend URL and validation ID token without keychain', () => {
  const configSwift = read('ios/PDFViewer/AcaciaConfig.swift');
  const configBridge = read('ios/PDFViewer/AcaciaConfigBridge.m');
  const authSwift = read('ios/PDFViewer/AcaciaAuth.swift');
  const authBridge = read('ios/PDFViewer/AcaciaAuthBridge.m');
  const project = read('ios/PDFViewer.xcodeproj/project.pbxproj');
  const entitlements = read('ios/PDFViewer/PDFViewer.entitlements');

  expect(configSwift).toContain('ACACIA_PRO_API_BASE_URL');
  expect(configSwift).toContain('AcaciaProAPIBaseURL');
  expect(configSwift).toContain('placeholderBuildSetting');
  expect(authSwift).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(authSwift).toContain('AcaciaFirebaseIDToken');
  expect(authSwift).toContain('AcaciaFirebaseWebAPIKey');
  expect(authSwift).toContain('AuthenticationServices');
  expect(authSwift).toContain('CryptoKit');
  expect(authSwift).toContain('signInWithApple');
  expect(authSwift).toContain('requestAppleAuthorizationCode');
  expect(authSwift).toContain('deleteFirebaseAccount');
  expect(authSwift).toContain('authorizationCode');
  expect(authSwift).toContain('accounts:signInWithIdp');
  expect(authSwift).toContain('accounts:delete');
  expect(authSwift).toContain('providerId=apple.com');
  expect(authSwift).toContain('nonce=');
  expect(authSwift).toContain('identitytoolkit.googleapis.com');
  expect(authSwift).toContain('securetoken.googleapis.com');
  expect(authSwift).toContain('UserDefaults.standard');
  expect(authSwift).toContain('CharacterSet.alphanumerics');
  expect(authSwift).not.toContain('.urlQueryAllowed');
  expect(authSwift).toContain('NSNull()');
  expect(configBridge).toContain('RCT_EXTERN_MODULE(AcaciaConfig, NSObject)');
  expect(authBridge).toContain('RCT_EXTERN_MODULE(AcaciaAuth, NSObject)');
  expect(authBridge).toContain('RCT_EXTERN_METHOD(signInWithApple');
  expect(authBridge).toContain('RCT_EXTERN_METHOD(requestAppleAuthorizationCode');
  expect(authBridge).toContain('RCT_EXTERN_METHOD(deleteFirebaseAccount');
  expect(project).toContain('AcaciaConfig.swift');
  expect(project).toContain('AcaciaConfigBridge.m');
  expect(project).toContain('AcaciaAuth.swift');
  expect(project).toContain('AcaciaAuthBridge.m');
  expect(project).toContain('CODE_SIGN_ENTITLEMENTS = PDFViewer/PDFViewer.entitlements;');
  expect(entitlements).toContain('com.apple.developer.applesignin');
  expect(entitlements).toContain('<string>Default</string>');
});

test('macOS Pro config and auth bridges expose backend URL and validation ID token without keychain', () => {
  const configSwift = read('macos/PDFViewer-macOS/AcaciaConfig.swift');
  const configBridge = read('macos/PDFViewer-macOS/AcaciaConfigBridge.m');
  const authSwift = read('macos/PDFViewer-macOS/AcaciaAuth.swift');
  const authBridge = read('macos/PDFViewer-macOS/AcaciaAuthBridge.m');
  const project = read('macos/Acacia.xcodeproj/project.pbxproj');
  const entitlements = read('macos/PDFViewer-macOS/PDFViewer.entitlements');

  expect(configSwift).toContain('ACACIA_PRO_API_BASE_URL');
  expect(configSwift).toContain('AcaciaProAPIBaseURL');
  expect(configSwift).toContain('placeholderBuildSetting');
  expect(authSwift).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(authSwift).toContain('AcaciaFirebaseIDToken');
  expect(authSwift).toContain('AcaciaFirebaseWebAPIKey');
  expect(authSwift).toContain('AuthenticationServices');
  expect(authSwift).toContain('CryptoKit');
  expect(authSwift).toContain('signInWithApple');
  expect(authSwift).toContain('requestAppleAuthorizationCode');
  expect(authSwift).toContain('deleteFirebaseAccount');
  expect(authSwift).toContain('authorizationCode');
  expect(authSwift).toContain('accounts:signInWithIdp');
  expect(authSwift).toContain('accounts:delete');
  expect(authSwift).toContain('providerId=apple.com');
  expect(authSwift).toContain('nonce=');
  expect(authSwift).toContain('identitytoolkit.googleapis.com');
  expect(authSwift).toContain('securetoken.googleapis.com');
  expect(authSwift).toContain('UserDefaults.standard');
  expect(authSwift).toContain('CharacterSet.alphanumerics');
  expect(authSwift).not.toContain('.urlQueryAllowed');
  expect(authSwift).toContain('NSNull()');
  expect(configBridge).toContain('RCT_EXTERN_MODULE(AcaciaConfig, NSObject)');
  expect(authBridge).toContain('RCT_EXTERN_MODULE(AcaciaAuth, NSObject)');
  expect(authBridge).toContain('RCT_EXTERN_METHOD(signInWithApple');
  expect(authBridge).toContain('RCT_EXTERN_METHOD(requestAppleAuthorizationCode');
  expect(authBridge).toContain('RCT_EXTERN_METHOD(deleteFirebaseAccount');
  expect(project).toContain('AcaciaConfig.swift');
  expect(project).toContain('AcaciaConfigBridge.m');
  expect(project).toContain('AcaciaAuth.swift');
  expect(project).toContain('AcaciaAuthBridge.m');
  expect(entitlements).toContain('com.apple.developer.applesignin');
  expect(entitlements).toContain('<string>Default</string>');
});

test('Podfiles disable fmt consteval path for current Apple clang builds', () => {
  const iosPodfile = read('ios/Podfile');
  const macosPodfile = read('macos/Podfile');

  expect(iosPodfile).toContain('target.name == \'fmt\'');
  expect(iosPodfile).toContain('FMT_USE_CONSTEVAL=0');
  expect(iosPodfile).toContain('CLANG_CXX_LANGUAGE_STANDARD');
  expect(iosPodfile).toContain('gnu++17');
  expect(macosPodfile).toContain('target.name == \'fmt\'');
  expect(macosPodfile).toContain('FMT_USE_CONSTEVAL=0');
  expect(macosPodfile).toContain('CLANG_CXX_LANGUAGE_STANDARD');
  expect(macosPodfile).toContain('gnu++17');
});
