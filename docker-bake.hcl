variable "TAG" {
  default = "release"
}

group "default" {
  targets = ["api", "web"]
}

target "common" {
  context   = "."
  platforms = ["linux/amd64"]
}

target "api" {
  inherits  = ["common"]
  dockerfile = "apps/api/Dockerfile"
  tags      = ["printlink-api:${TAG}"]
}

target "web" {
  inherits  = ["common"]
  dockerfile = "apps/web/Dockerfile"
  tags      = ["printlink-web:${TAG}"]
}
