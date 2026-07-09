import SwiftUI
import UIKit

/// A growing UITextView that accepts pasted images in-field like iOS Messages:
/// a paste with image data on the clipboard is routed to `onPasteImages` and
/// added as an attachment rather than dropped into the text.
struct PasteAwareTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat
    var onPasteImages: ([UIImage]) -> Void

    private let minHeight: CGFloat = 34
    private let maxHeight: CGFloat = 120

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> PasteTextView {
        let view = PasteTextView()
        view.delegate = context.coordinator
        view.onPasteImages = onPasteImages
        view.font = .preferredFont(forTextStyle: .body)
        view.backgroundColor = .clear
        view.textContainerInset = UIEdgeInsets(top: 7, left: 6, bottom: 7, right: 6)
        view.isScrollEnabled = true
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ uiView: PasteTextView, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }
        uiView.onPasteImages = onPasteImages
        recalcHeight(uiView)
    }

    private func recalcHeight(_ view: UITextView) {
        let fitting = view.sizeThatFits(CGSize(width: view.bounds.width, height: .greatestFiniteMagnitude))
        let clamped = min(max(fitting.height, minHeight), maxHeight)
        if abs(height - clamped) > 0.5 {
            DispatchQueue.main.async { height = clamped }
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        private let parent: PasteAwareTextView

        init(_ parent: PasteAwareTextView) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            parent.recalcHeight(textView)
        }
    }
}

final class PasteTextView: UITextView {
    var onPasteImages: (([UIImage]) -> Void)?

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)) {
            return UIPasteboard.general.hasImages || UIPasteboard.general.hasStrings
        }
        return super.canPerformAction(action, withSender: sender)
    }

    override func paste(_ sender: Any?) {
        if UIPasteboard.general.hasImages, let images = UIPasteboard.general.images, !images.isEmpty {
            onPasteImages?(images)
            return
        }
        super.paste(sender)
    }
}
