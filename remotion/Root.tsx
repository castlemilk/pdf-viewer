import { Composition, Folder } from "remotion";
import { AcaciaAppPreview, AcaciaLaunchHero, AcaciaStorePreview } from "./Videos";

export const RemotionRoot = () => {
  return (
    <Folder name="Acacia">
      <Composition
        id="AcaciaLaunchHero"
        component={AcaciaLaunchHero}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AcaciaAppPreview"
        component={AcaciaAppPreview}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AcaciaStorePreviewPhone65"
        component={AcaciaStorePreview}
        durationInFrames={480}
        fps={30}
        width={886}
        height={1920}
        defaultProps={{
          sourceDir: "app-store-preview-source/iphone-65",
          device: "phone",
        }}
      />
      <Composition
        id="AcaciaStorePreviewPhone67"
        component={AcaciaStorePreview}
        durationInFrames={480}
        fps={30}
        width={886}
        height={1920}
        defaultProps={{
          sourceDir: "app-store-preview-source/iphone-67",
          device: "phone",
        }}
      />
      <Composition
        id="AcaciaStorePreviewIpad129"
        component={AcaciaStorePreview}
        durationInFrames={480}
        fps={30}
        width={1200}
        height={1600}
        defaultProps={{
          sourceDir: "app-store-preview-source/ipad-129",
          device: "tablet",
        }}
      />
    </Folder>
  );
};
