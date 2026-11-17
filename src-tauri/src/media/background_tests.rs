use super::tests::service;

#[tokio::test]
async fn imported_image_becomes_an_independent_managed_png()
-> Result<(), Box<dyn std::error::Error>> {
    let (service, directory) = service("background");
    let _cleanup = scopeguard::guard(directory.clone(), |path| {
        let _ = std::fs::remove_dir_all(path);
    });
    let source = directory.join("original.jpg");
    image::RgbImage::from_pixel(4, 3, image::Rgb([20, 40, 60])).save(&source)?;
    let asset = service
        .import_background(&source, &directory, "image")
        .await?;
    assert_eq!(asset.kind, "image");
    assert_eq!(asset.name, "original.jpg");
    assert!(asset.file.ends_with(".png"));
    tokio::fs::remove_file(source).await?;
    let decoded = image::open(directory.join("backgrounds").join(asset.file))?;
    assert_eq!((decoded.width(), decoded.height()), (4, 3));
    Ok(())
}
