import Foundation
import SwiftData

/// Metadata for a single captured frame.
///
/// ### The no-preview invariant
/// This model deliberately stores **no image data and no thumbnail**. The only
/// link to pixels is ``assetFileName``, a relative path inside the roll's
/// protected directory. Image bytes live on disk with file protection and are
/// only decoded after the owning ``FilmRoll`` is unlocked. There is no code path
/// that turns a `CapturedFrame` into a displayable image before unlock — that is
/// enforced by ``FilmRollStore`` and exercised by `NoPreviewRuleTests`.
@Model
final class CapturedFrame {

    @Attribute(.unique) var id: UUID

    /// 1-based position within the roll, mirroring a physical frame counter.
    var index: Int

    /// When the shutter was pressed.
    var capturedAt: Date

    /// Recipe slug this frame was developed with (matches the roll's recipe at
    /// capture time).
    var recipeID: String

    /// The recipe formula version used, so reveals are reproducible even if the
    /// catalog later changes. See ``FilmRecipe/formulaVersion``.
    var recipeFormulaVersion: Int

    /// Lens used for this shot (for EXIF-like detail on reveal).
    var lensRawValue: String

    /// File name of the processed, protected image relative to the roll's
    /// on-disk directory. The renderer writes the final recipe-applied image
    /// here; nothing reads it back before unlock.
    var assetFileName: String

    /// Pixel dimensions, captured at write time so locked UI can lay out a
    /// placeholder of the right aspect ratio without opening the file.
    var pixelWidth: Int
    var pixelHeight: Int

    /// Owning roll (inverse of ``FilmRoll/frames``).
    var roll: FilmRoll?

    init(
        id: UUID = UUID(),
        index: Int,
        capturedAt: Date = Date(),
        recipeID: String,
        recipeFormulaVersion: Int,
        lens: CameraLensOption,
        assetFileName: String,
        pixelWidth: Int = 0,
        pixelHeight: Int = 0,
        roll: FilmRoll? = nil
    ) {
        self.id = id
        self.index = index
        self.capturedAt = capturedAt
        self.recipeID = recipeID
        self.recipeFormulaVersion = recipeFormulaVersion
        self.lensRawValue = lens.rawValue
        self.assetFileName = assetFileName
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.roll = roll
    }

    /// Reconstructed lens option.
    var lens: CameraLensOption {
        CameraLensOption(rawValue: lensRawValue) ?? .wide
    }

    /// Aspect ratio for placeholder layout while locked; defaults to 4:3.
    var aspectRatio: Double {
        guard pixelWidth > 0, pixelHeight > 0 else { return 4.0 / 3.0 }
        return Double(pixelWidth) / Double(pixelHeight)
    }
}
