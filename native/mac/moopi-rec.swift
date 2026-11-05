// moopi-rec: records the microphone into an .m4a until a stop file appears (or maxSeconds pass).
//   moopi-rec <out.m4a> <stopfile> [maxSeconds]
// Part of MOOPI Desktop (macOS). The microphone permission is asked of the app that runs it.
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: moopi-rec <out.m4a> <stopfile> [maxSeconds]\n".data(using: .utf8)!)
    exit(2)
}
let out = URL(fileURLWithPath: args[1])
let stop = args[2]
let maxSeconds = args.count > 3 ? (Double(args[3]) ?? 120) : 120

let gate = DispatchSemaphore(value: 0)
var allowed = false
switch AVCaptureDevice.authorizationStatus(for: .audio) {
case .authorized:
    allowed = true
    gate.signal()
case .notDetermined:
    AVCaptureDevice.requestAccess(for: .audio) { granted in allowed = granted; gate.signal() }
default:
    gate.signal()
}
gate.wait()
guard allowed else {
    FileHandle.standardError.write("microphone denied\n".data(using: .utf8)!)
    exit(3)
}

let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
    AVSampleRateKey: 16000.0,
    AVNumberOfChannelsKey: 1,
    AVEncoderBitRateKey: 32000,
]
do {
    let recorder = try AVAudioRecorder(url: out, settings: settings)
    recorder.prepareToRecord()
    guard recorder.record() else {
        FileHandle.standardError.write("record failed\n".data(using: .utf8)!)
        exit(4)
    }
    let started = Date()
    while !FileManager.default.fileExists(atPath: stop) && Date().timeIntervalSince(started) < maxSeconds {
        Thread.sleep(forTimeInterval: 0.15)
    }
    recorder.stop()
    print("ok \(Int(Date().timeIntervalSince(started)))s")
} catch {
    FileHandle.standardError.write("error \(error)\n".data(using: .utf8)!)
    exit(5)
}
