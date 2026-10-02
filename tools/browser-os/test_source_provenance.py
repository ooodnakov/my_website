import pathlib
import unittest

from source_provenance import _expand_reference, _source_items, _source_references


# Exact source and conditional-prepend form from pinned
# main/linux-lts/APKBUILD at d5a34efc88bbe8d18737fda28125071c4aef8517.
KERNEL_SOURCE_FIXTURE = """\
pkgver=6.18.54
_kernver=${pkgver%.*}
source="https://cdn.kernel.org/pub/linux/kernel/v${pkgver%%.*}.x/linux-$_kernver.tar.xz
"
if [ -n "$FLAVOR" ]; then
\tsource="$source
\t${FLAVOR}.${CARCH}.config"
fi
if [ "${pkgver%.0}" = "$pkgver" ]; then
\tsource="patch-$pkgver.patch.xz::https://cdn.kernel.org/pub/linux/kernel/v${pkgver%%.*}.x/patch-$pkgver.xz $source"
fi
sha512sums="
9bc159d518172c35540c1ebb82315f56b2052506119017eddae4a3200a21255b56937f452e73eb3799e4a0bf4f7deb814e7c7430223333b9ac6e85c13d532f2f  patch-6.18.54.patch.xz
88599ffdec96d150c1feb9b261ba93bb0301a9d0e1ad6bef7aeab1f5372cbfc57d8b43c7e902bd8f76921d1dbd8189663c142ea869e51d0e2b483b150ee00fe0  linux-6.18.tar.xz
"
"""


class SourceReferenceExpansionTest(unittest.TestCase):
    def test_recipe_variables_resolve_in_upstream_source_urls(self):
        variables = {"_v": "2.42", "pkgver": "1.2_beta"}

        reference = _expand_reference(
            "https://example.test/v$_v/less-${pkgver/_beta/-beta}.tar.gz",
            variables,
        )

        self.assertEqual(reference, "https://example.test/v2.42/less-1.2-beta.tar.gz")

    def test_shell_prefix_and_suffix_removal_preserves_version_material(self):
        variables = {
            "pkgver": "15.2.0_git20261001",
            "kernel": "6.18.54",
        }

        self.assertEqual(_expand_reference("gcc-${pkgver%%_git*}", variables), "gcc-15.2.0")
        self.assertEqual(_expand_reference("linux-${kernel%.*}", variables), "linux-6.18")


class ConditionalSourceInventoryTest(unittest.TestCase):
    def materials(self, recipe=KERNEL_SOURCE_FIXTURE, pkgver="6.18.54"):
        return _source_items(
            recipe,
            pathlib.Path("."),
            "pinned-test-commit",
            "main/linux-lts/APKBUILD",
            "linux-lts",
            pkgver,
            "0",
            "x86",
        )

    def test_pinned_linux_recipe_prepends_stable_patch_with_alias_and_sha512(self):
        materials = self.materials()
        patch = materials[0]

        self.assertEqual(len(materials), 2)
        self.assertEqual(
            patch["reference"],
            "patch-6.18.54.patch.xz::https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.18.54.xz",
        )
        self.assertEqual(patch["referenceMode"], "APKBUILD source list")
        self.assertEqual(patch["declaredFilename"], "patch-6.18.54.patch.xz")
        self.assertEqual(
            patch["declaredUrl"],
            "https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.18.54.xz",
        )
        self.assertEqual(patch["checksumAlgorithm"], "sha512")
        self.assertEqual(
            patch["declaredChecksum"],
            "9bc159d518172c35540c1ebb82315f56b2052506119017eddae4a3200a21255b56937f452e73eb3799e4a0bf4f7deb814e7c7430223333b9ac6e85c13d532f2f",
        )
        self.assertEqual(patch["kind"], "patch")

    def test_release_version_with_dot_zero_omits_stable_patch(self):
        recipe = KERNEL_SOURCE_FIXTURE.replace("pkgver=6.18.54", "pkgver=6.18.0").replace(
            "9bc159d518172c35540c1ebb82315f56b2052506119017eddae4a3200a21255b56937f452e73eb3799e4a0bf4f7deb814e7c7430223333b9ac6e85c13d532f2f  patch-6.18.54.patch.xz\n",
            "",
        )

        materials = self.materials(recipe, pkgver="6.18.0")

        self.assertEqual(
            [item["declaredFilename"] for item in materials],
            ["linux-6.18.tar.xz"],
        )

    def test_unmapped_declared_checksum_fails_inventory_completeness(self):
        recipe = KERNEL_SOURCE_FIXTURE.replace(
            '\tsource="patch-$pkgver.patch.xz::https://cdn.kernel.org/pub/linux/kernel/v${pkgver%%.*}.x/patch-$pkgver.xz $source"',
            '\tsource="$source"',
        )

        with self.assertRaisesRegex(ValueError, "patch-6.18.54.patch.xz"):
            self.materials(recipe)

    def test_checksum_list_without_effective_source_assignment_fails_closed(self):
        recipe = 'sha512sums="abc  orphan.tar.xz"\n'

        with self.assertRaisesRegex(ValueError, "no effective source assignment"):
            self.materials(recipe)

    def test_unsupported_conditional_source_fails_closed(self):
        recipe = KERNEL_SOURCE_FIXTURE.replace(
            'if [ -n "$FLAVOR" ]; then',
            'if [ -f "$FLAVOR" ]; then',
        )

        with self.assertRaisesRegex(ValueError, "unsupported conditional"):
            self.materials(recipe)

    def test_source_assignment_inside_function_fails_closed(self):
        recipe = 'helper() {\nsource="https://example.test/source.tar.xz"\n}\n'

        with self.assertRaisesRegex(ValueError, "unsupported shell scope"):
            _source_references(recipe, {})

    def test_dynamic_source_loop_fails_closed(self):
        recipe = 'for _key in $(printf "source"); do\n\tsource="$source $_key"\ndone\n'

        with self.assertRaisesRegex(ValueError, "unsupported loop"):
            _source_references(recipe, {})

    def test_static_source_loop_resolves_declared_packaging_files(self):
        recipe = """\
for _key in $_keys; do
\tsource="$source ${_key#*:}"
done
"""

        references = _source_references(
            recipe,
            {"_keys": "x86:first.pub\nx86_64:second.pub"},
        )

        self.assertEqual(references, ["first.pub", "second.pub"])


if __name__ == "__main__":
    unittest.main()
