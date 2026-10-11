package discord

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"sync"
)

var celebrationOnce sync.Once
var celebrationData []byte
var celebrationErr error

// A small original animation attached directly to Discord, with no external
// media host or expiring image URL. Cache encoding across notifications.
func celebrationGIF() ([]byte, error) {
	celebrationOnce.Do(func() {
		palette := color.Palette{color.RGBA{53, 48, 77, 255}, color.RGBA{185, 164, 255, 255}, color.RGBA{56, 173, 125, 255}, color.RGBA{231, 169, 56, 255}, color.RGBA{228, 219, 255, 255}}
		anim := &gif.GIF{LoopCount: 0}
		for frame := 0; frame < 24; frame++ {
			img := image.NewPaletted(image.Rect(0, 0, 440, 96), palette)
			draw.Draw(img, img.Bounds(), image.NewUniform(palette[0]), image.Point{}, draw.Src)
			for n := 0; n < 38; n++ {
				x := (n*73 + frame*(n%3-1) + 440) % 440
				y := (n*29+frame*(2+n%3))%116 - 10
				draw.Draw(img, image.Rect(x, y, x+4+n%3, y+6), image.NewUniform(palette[1+n%4]), image.Point{}, draw.Src)
			}
			// A large checkmark in the center keeps the celebration readable.
			for x := 0; x < 20; x++ {
				draw.Draw(img, image.Rect(190+x, 43+x, 196+x, 49+x), image.NewUniform(palette[4]), image.Point{}, draw.Src)
			}
			for x := 0; x < 42; x++ {
				draw.Draw(img, image.Rect(208+x, 61-x, 214+x, 67-x), image.NewUniform(palette[4]), image.Point{}, draw.Src)
			}
			anim.Image = append(anim.Image, img)
			anim.Delay = append(anim.Delay, 7)
			anim.Disposal = append(anim.Disposal, gif.DisposalNone)
		}
		var buf bytes.Buffer
		celebrationErr = gif.EncodeAll(&buf, anim)
		celebrationData = buf.Bytes()
	})
	return celebrationData, celebrationErr
}
