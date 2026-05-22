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

  expect(configSwift).toContain('ACACIA_PRO_API_BASE_URL');
  expect(configSwift).toContain('AcaciaProAPIBaseURL');
  expect(configSwift).toContain('placeholderBuildSetting');
  expect(authSwift).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(authSwift).toContain('AcaciaFirebaseIDToken');
  expect(authSwift).toContain('AcaciaFirebaseWebAPIKey');
  expect(authSwift).toContain('identitytoolkit.googleapis.com');
  expect(authSwift).toContain('securetoken.googleapis.com');
  expect(authSwift).toContain('UserDefaults.standard');
  expect(authSwift).toContain('CharacterSet.alphanumerics');
  expect(authSwift).not.toContain('.urlQueryAllowed');
  expect(authSwift).toContain('NSNull()');
  expect(configBridge).toContain('RCT_EXTERN_MODULE(AcaciaConfig, NSObject)');
  expect(authBridge).toContain('RCT_EXTERN_MODULE(AcaciaAuth, NSObject)');
  expect(project).toContain('AcaciaConfig.swift');
  expect(project).toContain('AcaciaConfigBridge.m');
  expect(project).toContain('AcaciaAuth.swift');
  expect(project).toContain('AcaciaAuthBridge.m');
});

test('macOS Pro config and auth bridges expose backend URL and validation ID token without keychain', () => {
  const configSwift = read('macos/PDFViewer-macOS/AcaciaConfig.swift');
  const configBridge = read('macos/PDFViewer-macOS/AcaciaConfigBridge.m');
  const authSwift = read('macos/PDFViewer-macOS/AcaciaAuth.swift');
  const authBridge = read('macos/PDFViewer-macOS/AcaciaAuthBridge.m');
  const project = read('macos/Acacia.xcodeproj/project.pbxproj');

  expect(configSwift).toContain('ACACIA_PRO_API_BASE_URL');
  expect(configSwift).toContain('AcaciaProAPIBaseURL');
  expect(configSwift).toContain('placeholderBuildSetting');
  expect(authSwift).toContain('ACACIA_FIREBASE_ID_TOKEN');
  expect(authSwift).toContain('AcaciaFirebaseIDToken');
  expect(authSwift).toContain('AcaciaFirebaseWebAPIKey');
  expect(authSwift).toContain('identitytoolkit.googleapis.com');
  expect(authSwift).toContain('securetoken.googleapis.com');
  expect(authSwift).toContain('UserDefaults.standard');
  expect(authSwift).toContain('CharacterSet.alphanumerics');
  expect(authSwift).not.toContain('.urlQueryAllowed');
  expect(authSwift).toContain('NSNull()');
  expect(configBridge).toContain('RCT_EXTERN_MODULE(AcaciaConfig, NSObject)');
  expect(authBridge).toContain('RCT_EXTERN_MODULE(AcaciaAuth, NSObject)');
  expect(project).toContain('AcaciaConfig.swift');
  expect(project).toContain('AcaciaConfigBridge.m');
  expect(project).toContain('AcaciaAuth.swift');
  expect(project).toContain('AcaciaAuthBridge.m');
});
