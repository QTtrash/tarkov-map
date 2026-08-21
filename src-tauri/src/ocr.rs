use std::path::Path;

#[cfg(windows)]
pub fn read_exfil_text(path: &Path) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Graphics::Imaging::{
        BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, BitmapTransform, ColorManagementMode,
        ExifOrientationMode,
    };
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::{FileAccessMode, StorageFile};

    let path = path
        .to_str()
        .ok_or_else(|| "Screenshot path is not valid Unicode".to_string())?;
    {
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
            .map_err(|error| error.to_string())?
            .join()
            .map_err(|error| format!("Screenshot is not readable yet: {error}"))?;
        let stream = file
            .OpenAsync(FileAccessMode::Read)
            .map_err(|error| error.to_string())?
            .join()
            .map_err(|error| error.to_string())?;
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .map_err(|error| error.to_string())?
            .join()
            .map_err(|error| error.to_string())?;
        let source_width = decoder.PixelWidth().map_err(|error| error.to_string())?;
        let source_height = decoder.PixelHeight().map_err(|error| error.to_string())?;
        let maximum = OcrEngine::MaxImageDimension().map_err(|error| error.to_string())? as f64;
        let scale = (maximum / source_width.max(source_height) as f64).min(1.0);
        let width = (source_width as f64 * scale).round() as u32;
        let height = (source_height as f64 * scale).round() as u32;
        let transform = BitmapTransform::new().map_err(|error| error.to_string())?;
        transform
            .SetScaledWidth(width)
            .map_err(|error| error.to_string())?;
        transform
            .SetScaledHeight(height)
            .map_err(|error| error.to_string())?;
        let bitmap = decoder
            .GetSoftwareBitmapTransformedAsync(
                BitmapPixelFormat::Bgra8,
                BitmapAlphaMode::Premultiplied,
                &transform,
                ExifOrientationMode::IgnoreExifOrientation,
                ColorManagementMode::DoNotColorManage,
            )
            .map_err(|error| error.to_string())?
            .join()
            .map_err(|error| error.to_string())?;
        let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|error| {
            format!("Windows OCR is unavailable; install a Windows language OCR pack: {error}")
        })?;
        let result = engine
            .RecognizeAsync(&bitmap)
            .map_err(|error| error.to_string())?
            .join()
            .map_err(|error| error.to_string())?;
        let lines = result.Lines().map_err(|error| error.to_string())?;
        let mut selected = Vec::new();
        for line in lines {
            let words = line.Words().map_err(|error| error.to_string())?;
            let Some(first) = words
                .First()
                .ok()
                .and_then(|iterator| iterator.Current().ok())
            else {
                continue;
            };
            let rect = first.BoundingRect().map_err(|error| error.to_string())?;
            if rect.X >= width as f32 * 0.48 && rect.Y <= height as f32 * 0.62 {
                selected.push(line.Text().map_err(|error| error.to_string())?.to_string());
            }
        }
        Ok(selected.join("\n"))
    }
}

#[cfg(not(windows))]
pub fn read_exfil_text(_path: &Path) -> Result<String, String> {
    Err("Active-extract OCR is currently available on Windows only".into())
}
