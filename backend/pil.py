from PIL import Image
import os

img = Image.open("Gemini_Generated_Image_yk9g14yk9g14yk9g.png")
width, height = img.size
w_step, h_step = width // 3, height // 3

# Make output directory in frontend public map
out_dir = "../se-hack/public/meeting_faces"
os.makedirs(out_dir, exist_ok=True)

for i in range(3): # Rows (people)
    for j in range(3): # Cols (states: closed, open, wide)
        box = (j * w_step, i * h_step, (j + 1) * w_step, (i + 1) * h_step)
        yield_img = img.crop(box)
        yield_img.convert("RGB").save(os.path.join(out_dir, f"face_{i}_{j}.jpg"))
