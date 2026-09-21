# SPEC.md

## 1. Mục tiêu

Xây một website demo trực quan cho thấy website có thể quan sát và suy ra những gì từ trình duyệt/người dùng, đặc biệt qua browser fingerprinting và các side-effect ẩn.

Site không chỉ trả về một “fingerprint score”, mà phải giải thích:
- API nào đang được gọi
- Website học được gì
- Dữ liệu có ổn định/đủ hữu ích để tracking không
- Browser có chặn, randomize hoặc bucket giá trị không
- Có side-effect nào ngoài đời thật hay không
- Dữ liệu nào thực sự được gửi ra server

## 2. Trang chính

Trang chính hiển thị:
- Tóm tắt browser/device hiện tại
- Danh sách các experiment
- Trạng thái từng experiment: Observed / Inferred / Randomized / Blocked / Permission required
- Không dùng điểm số kiểu “87/100 trackable”

Mỗi experiment phải chạy độc lập và có giải thích ngắn.

## 3. Experiment cần có

### Fingerprinting cơ bản
- Canvas
- TextMetrics / DOM geometry
- WebGL
- WebGPU
- Screen / viewport / devicePixelRatio
- hardwareConcurrency
- deviceMemory
- Fonts
- CSS media queries
- AudioContext / WebAudio
- Speech synthesis voices
- Supported codecs / media capabilities
- WebRTC
- Media devices
- Performance / timing signals
- Mouse, scroll, pointer và touch characteristics

### Privacy / browser protection
Cho thấy browser có:
- trả giá trị thật
- bucket giá trị
- randomize/noise
- partition theo origin
- yêu cầu permission
- block hoàn toàn

Cần hoạt động và so sánh tốt trên:
- Chrome
- Firefox
- Safari
- Brave

## 4. AliExpress case study

Có một demo riêng lấy cảm hứng từ vụ AliExpress 8/2026.

Demo WebAudio graph:
oscillator → analyser → processor → gain=0 → destination

Phải cho người dùng thấy:
- không có audio nghe được
- AudioContext vẫn active
- graph vẫn nối tới audio destination
- đây có thể gây side-effect trên audio/Bluetooth ở một số hệ thống

Không tự động chạy experiment này. Người dùng phải chủ động bấm Start.

Không khẳng định WebAudio hiện là fingerprint mạnh trên mọi browser. Hiển thị rõ khi browser đã làm giảm entropy của signal này.

## 5. Experiment detail panel

Mỗi experiment hiển thị:

### Code executed
API/browser feature vừa được gọi.

### What the page learned
Dữ liệu website quan sát được.

### Stability
Giá trị có thay đổi khi:
- reload
- resize
- mở tab mới
- private mode
- browser restart

### Browser intervention
Browser có sửa, giảm precision hoặc randomize dữ liệu không.

### Tracking usefulness
Giải thích signal này:
- có entropy cao/thấp
- có persistent hay không
- hữu ích riêng lẻ hay chủ yếu khi ghép với signal khác

### Side effects
Ví dụ:
- kích hoạt audio subsystem
- tăng CPU/GPU usage
- tạo permission prompt
- network request
- access local device resources

### Network
Hiển thị chính xác dữ liệu nào được gửi khỏi máy.

## 6. Fingerprint diff

Cho phép người dùng:
- chụp snapshot fingerprint
- reload rồi so sánh
- resize window rồi so sánh
- bật/tắt privacy protection rồi so sánh
- mở browser/private mode khác rồi nhập snapshot để đối chiếu

UI phải chỉ ra field nào:
- unchanged
- changed
- randomized
- unavailable

## 7. Local-only mặc định

Mặc định toàn bộ experiment chạy local.

Không upload fingerprint đầy đủ.

Không dùng third-party analytics trong trang experiment.

Nếu có experiment cần server:
- phải opt-in rõ ràng
- hiển thị payload trước khi gửi
- dùng experiment ID ngẫu nhiên
- dữ liệu có TTL ngắn
- không dùng dữ liệu cho analytics hoặc profiling

## 8. Historical / blocked techniques

Có khu vực riêng cho các kỹ thuật cũ hoặc đã bị browser hạn chế mạnh.

Ví dụ:
- legacy WebAudio fingerprint
- local network probing
- WebRTC IP leakage cũ
- plugin enumeration cũ

Mục đích là cho thấy browser privacy model đã thay đổi theo thời gian.

## 9. Không làm

Không:
- tuyên bố người dùng “unique” chỉ dựa vào sample nhỏ
- dùng một tracking score tổng hợp thiếu căn cứ
- cố bypass browser privacy protections
- scan LAN tự động
- xin microphone/camera nếu experiment không thực sự cần
- fingerprint người dùng ngầm
- gửi dữ liệu cho bên thứ ba
- mô tả inference như fact

## 10. Nguyên tắc UX

Site phải khiến người dùng hiểu được sự khác biệt giữa:
- Observed: browser trả trực tiếp
- Inferred: suy ra từ nhiều signal
- Randomized: browser cố tình làm nhiễu
- Blocked: browser không cho truy cập
- Permission required: cần người dùng cấp quyền
- Sent: dữ liệu đã rời khỏi thiết bị

Ưu tiên giải thích ngắn, trực quan, có thể mở rộng phần technical details khi cần.

## 11. MVP

MVP chỉ cần:
- Landing page
- Experiment list
- Canvas
- WebGL
- Screen / viewport
- CPU / memory hints
- Fonts
- CSS media queries
- WebAudio + AliExpress-style case study
- WebRTC
- Mouse / scroll signals
- Fingerprint snapshot + diff
- Browser protection explanation
- Network payload inspector
- Local-only architecture

Không cần account, login, dashboard hay database người dùng.
