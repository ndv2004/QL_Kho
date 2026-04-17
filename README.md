# QL Kho / Bán hàng

## Chạy nhanh
1. `npm install`
2. Tạo `.env` từ `.env.example`
3. `npm run seed`
4. `npm start`

## Tài khoản mẫu
- `takhanhly / 22092006`
- `admin / admin123`

## Dữ liệu seed
- Toàn bộ sản phẩm được lấy từ file `Bảng báo giá(1).xlsx`
- Nhà cung ứng: `Tạ Khánh Ly`
- Ngày nhập khởi tạo: `31/03/2026`

## Lưu ý
- Mã sản phẩm trong bảng báo giá có một số mã trùng giữa các dòng khác nhau, nên cơ sở dữ liệu đã được thiết kế để **không ép unique** lên `products.code`.
- Seed sẽ xóa sạch dữ liệu hiện có rồi nạp lại theo workbook.
