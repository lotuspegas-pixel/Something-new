import Foundation
import SwiftData

/// Raised when image bytes are requested for a frame whose roll is still locked.
/// This is the runtime backstop for the no-preview product rule.
struct RollLockedError: Error, Equatable {
    let rollID: UUID
    let unlockDate: Date
}

/// Owns roll/frame persistence and the on-disk lifecycle of locked images.
///
/// This is the single gatekeeper between captured pixels and the user's eyes:
/// - frames are written to a protected per-roll directory by the processing
///   service, and
/// - ``revealedImageData(for:now:)`` is the *only* way to read those bytes back,
///   and it refuses while the roll is locked.
///
/// Phase 1 defines the contract and a SwiftData-backed implementation skeleton;
/// the capture wiring is completed in Phase 2/3.
protocol FilmRollStore {
    /// Creates and persists a new, empty, locked roll.
    @discardableResult
    func createRoll(
        title: String,
        schedule: DevelopmentSchedule,
        recipe: FilmRecipe,
        capacity: Int,
        now: Date
    ) throws -> FilmRoll

    /// All rolls, newest first.
    func rolls() throws -> [FilmRoll]

    /// Processes `photo` with the roll's recipe and appends a locked frame.
    func addFrame(to roll: FilmRoll, photo: CapturedPhoto) async throws

    /// Marks the roll developed if it is eligible (date passed). No-op otherwise.
    func develop(_ roll: FilmRoll, now: Date) throws

    /// Archives a revealed roll. No-op if it isn't revealed.
    func archive(_ roll: FilmRoll) throws

    /// Returns decoded image bytes for a frame — **only if its roll is
    /// unlocked**. Throws ``RollLockedError`` while locked.
    func revealedImageData(for frame: CapturedFrame, now: Date) throws -> Data

    /// Deletes a roll, its frames, and its on-disk directory.
    func deleteRoll(_ roll: FilmRoll) throws

    /// The protected directory backing a roll's frames.
    func directory(for roll: FilmRoll) -> URL
}

/// SwiftData + file-system implementation.
final class SwiftDataFilmRollStore: FilmRollStore {

    private let context: ModelContext
    private let processor: ImageProcessingService
    private let scheduler: DevelopmentScheduler
    private let fileManager: FileManager
    private let rootDirectory: URL

    init(
        context: ModelContext,
        processor: ImageProcessingService = DefaultImageProcessingService(),
        scheduler: DevelopmentScheduler = CalendarDevelopmentScheduler(),
        fileManager: FileManager = .default,
        rootDirectory: URL? = nil
    ) {
        self.context = context
        self.processor = processor
        self.scheduler = scheduler
        self.fileManager = fileManager
        if let rootDirectory {
            self.rootDirectory = rootDirectory
        } else {
            let support = (try? fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )) ?? fileManager.temporaryDirectory
            self.rootDirectory = support.appendingPathComponent("Rolls", isDirectory: true)
        }
    }

    // MARK: Rolls

    @discardableResult
    func createRoll(
        title: String,
        schedule: DevelopmentSchedule,
        recipe: FilmRecipe,
        capacity: Int = 27,
        now: Date = Date()
    ) throws -> FilmRoll {
        let unlock = scheduler.unlockDate(for: schedule, from: now)
        let roll = FilmRoll(
            title: title,
            createdAt: now,
            unlockDate: unlock,
            schedule: schedule,
            recipeID: recipe.id,
            recipeName: recipe.displayName,
            capacity: capacity
        )
        context.insert(roll)
        try ensureDirectoryExists(for: roll)
        try context.save()
        return roll
    }

    func rolls() throws -> [FilmRoll] {
        let descriptor = FetchDescriptor<FilmRoll>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return try context.fetch(descriptor)
    }

    func addFrame(to roll: FilmRoll, photo: CapturedPhoto) async throws {
        guard !roll.isFull else { throw CameraError.captureFailed }
        let customStore = SwiftDataCustomRecipeStore(context: context)
        guard let recipe = RecipeResolver.resolve(id: roll.recipeID, customStore: customStore) else {
            throw CameraError.captureFailed
        }

        let index = roll.frameCount + 1
        let fileName = "frame-\(String(format: "%03d", index)).jpg"
        let dir = directory(for: roll)
        try ensureDirectoryExists(for: roll)

        let info = try await processor.process(
            photo,
            recipe: recipe,
            destinationDirectory: dir,
            fileName: fileName
        )

        let frame = CapturedFrame(
            index: index,
            recipeID: recipe.id,
            recipeFormulaVersion: recipe.version,
            lens: .wide,
            assetFileName: info.fileName,
            pixelWidth: info.pixelWidth,
            pixelHeight: info.pixelHeight,
            roll: roll
        )
        // Setting `frame.roll` in the initializer maintains the inverse
        // relationship; appending again would duplicate the frame.
        context.insert(frame)
        roll.frameCount = index
        try context.save()
    }

    func develop(_ roll: FilmRoll, now: Date = Date()) throws {
        guard roll.developedAt == nil, now >= roll.unlockDate else { return }
        roll.developedAt = now
        try context.save()
    }

    func archive(_ roll: FilmRoll) throws {
        guard roll.developedAt != nil, roll.archivedAt == nil else { return }
        roll.archivedAt = Date()
        try context.save()
    }

    // MARK: The no-preview gate

    func revealedImageData(for frame: CapturedFrame, now: Date = Date()) throws -> Data {
        guard let roll = frame.roll else {
            throw RollLockedError(rollID: UUID(), unlockDate: .distantFuture)
        }
        guard roll.isUnlocked(now: now) else {
            throw RollLockedError(rollID: roll.id, unlockDate: roll.unlockDate)
        }
        let url = directory(for: roll).appendingPathComponent(frame.assetFileName)
        return try Data(contentsOf: url)
    }

    // MARK: Files

    func deleteRoll(_ roll: FilmRoll) throws {
        let dir = directory(for: roll)
        if fileManager.fileExists(atPath: dir.path) {
            try? fileManager.removeItem(at: dir)
        }
        context.delete(roll)
        try context.save()
    }

    func directory(for roll: FilmRoll) -> URL {
        rootDirectory.appendingPathComponent(roll.id.uuidString, isDirectory: true)
    }

    private func ensureDirectoryExists(for roll: FilmRoll) throws {
        let dir = directory(for: roll)
        guard !fileManager.fileExists(atPath: dir.path) else { return }
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        // Protect the whole directory at rest.
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: dir.path
        )
    }
}
