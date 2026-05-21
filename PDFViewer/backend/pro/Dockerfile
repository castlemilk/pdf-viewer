FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/acacia-pro ./cmd/acacia-pro

FROM gcr.io/distroless/static-debian12:nonroot

ENV PORT=8080
COPY --from=build /out/acacia-pro /acacia-pro
USER nonroot:nonroot
ENTRYPOINT ["/acacia-pro"]
