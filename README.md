# QL Kho - bản cập nhật mới

## Chạy dự án
```bash
npm install
node server.js
```

## Seed dữ liệu
```bash
node seed.js --reset
```

Hoặc:
```bash
npm run seed:reset
```

## Tài khoản mẫu
- `admin / admin123`
- `takhanhly / 22092006`
- `nhanvien / 123456`

## Ghi chú
- Dữ liệu seed được tạo từ file `Bảng báo giá(1).xlsx`
- Toàn bộ tồn kho khởi tạo ngày `31/03/2026`
- Seed sẽ xóa sạch dữ liệu cũ khi chạy với `--reset`


## Phân quyền
- `manager`: truy cập toàn bộ menu và thao tác đầy đủ
- `staff`: chỉ thấy `Sản phẩm`, `Nhập kho`, `Bán hàng`, `Báo cáo`
- Các API quản trị master data, hóa đơn, lịch sử được khóa ở backend
- Tài khoản `takhanhly` hiện là `staff`
