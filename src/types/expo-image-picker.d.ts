declare module "expo-image-picker" {
  export type ImagePickerAsset = {
    uri: string;
    mimeType?: string | null;
    fileName?: string | null;
    base64?: string | null;
  };

  export type ImagePickerCanceledResult = {
    canceled: true;
    assets: null;
  };

  export type ImagePickerSuccessResult = {
    canceled: false;
    assets: ImagePickerAsset[];
  };

  export type ImagePickerResult = ImagePickerCanceledResult | ImagePickerSuccessResult;

  export function launchImageLibraryAsync(options?: {
    mediaTypes?: string[];
    allowsEditing?: boolean;
    aspect?: [number, number];
    quality?: number;
    base64?: boolean;
  }): Promise<ImagePickerResult>;

  export function launchCameraAsync(options?: {
    allowsEditing?: boolean;
    aspect?: [number, number];
    quality?: number;
    base64?: boolean;
  }): Promise<ImagePickerResult>;

  export function requestCameraPermissionsAsync(): Promise<{
    granted: boolean;
  }>;
}
