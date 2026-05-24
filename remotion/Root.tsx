import { Composition, Folder } from "remotion";
import { AcaciaAppPreview, AcaciaLaunchHero } from "./Videos";

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
    </Folder>
  );
};
