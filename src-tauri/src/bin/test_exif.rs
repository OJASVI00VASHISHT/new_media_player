use little_exif::metadata::Metadata;
use little_exif::exif_tag::ExifTag;

fn main() {
    let mut m = Metadata::new();
    m.set_tag(ExifTag::Orientation(vec![6]));
    for tag in m.into_iter() {
        if let ExifTag::Orientation(v) = tag {
            println!("Value: {}", v[0]);
        }
    }
}
