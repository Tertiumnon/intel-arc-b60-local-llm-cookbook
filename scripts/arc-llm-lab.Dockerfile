FROM archlinux:base-devel
RUN pacman -Syu --noconfirm --needed cmake ninja git vulkan-headers vulkan-icd-loader shaderc spirv-headers vulkan-intel
WORKDIR /work
