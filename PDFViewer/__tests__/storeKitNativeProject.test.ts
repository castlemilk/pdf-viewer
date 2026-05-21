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
  expect(bridge).toContain('RCT_EXTERN_MODULE(AcaciaStoreKit, NSObject)');
  expect(project).toContain('AcaciaStoreKit.swift');
  expect(project).toContain('AcaciaStoreKitBridge.m');
});

test('macOS StoreKit bridge is included in the app target', () => {
  const swift = read('macos/PDFViewer-macOS/AcaciaStoreKit.swift');
  const bridge = read('macos/PDFViewer-macOS/AcaciaStoreKitBridge.m');
  const project = read('macos/Acacia.xcodeproj/project.pbxproj');

  expect(swift).toContain('Product.PurchaseOption.appAccountToken');
  expect(swift).toContain('verification.jwsRepresentation');
  expect(bridge).toContain('RCT_EXTERN_MODULE(AcaciaStoreKit, NSObject)');
  expect(project).toContain('AcaciaStoreKit.swift');
  expect(project).toContain('AcaciaStoreKitBridge.m');
});
