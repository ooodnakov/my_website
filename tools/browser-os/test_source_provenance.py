import pathlib
import unittest

from source_provenance import _expand_reference, _source_items, _source_references


# Exact source and conditional-prepend form from the pinned linux-virt recipe
# override at 52fae6d7d56f3958f32e5bf9121a7536524b9ef4.
KERNEL_SOURCE_FIXTURE = """\
pkgver=6.18.55
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
274d804a47fc28a8260907ac27f2efc95a4668f67d31a036e88c82cdaf16e8a2ba33dce18f7b344595d2cbd60d310e7b6b0ccae6d1f4dab2eb65badb61e8ef66  patch-6.18.55.patch.xz
88599ffdec96d150c1feb9b261ba93bb0301a9d0e1ad6bef7aeab1f5372cbfc57d8b43c7e902bd8f76921d1dbd8189663c142ea869e51d0e2b483b150ee00fe0  linux-6.18.tar.xz
"
"""
READLINE_SOURCE_FIXTURE = """\
pkgname=readline
pkgver=8.3.3
_myver=${pkgver%.*}
source="https://ftp.gnu.org/gnu/readline/readline-$_myver.tar.gz
	"
_i=1
while [ $_i -le ${pkgver##*.} ]; do
	_patch=$(printf "%03d" $_i)
	_name=$pkgname${_myver//./}-$_patch
	source="$source
		$_name.patch::https://ftp.gnu.org/gnu/readline/readline-$_myver-patches/$_name"
	_i=$((_i+1))
done
sha512sums="
513002753dcf5db9213dbbb61d51217245f6a40d33b1dd45238e8062dfa8eef0c890b87a5548e11db959e842724fb572c4d3d7fb433773762a63c30efe808344  readline-8.3.tar.gz
ced50af353ed527f6ec0eac5f65261f2ed208825ec72fe2acf5f0217f34f84f33dcbf01b895325f6b33664b5a426bac99506193e2ddb6eea8c79ccad37364b89  readline83-001.patch
e45ad6443bd4e271ec8e8ab883de561b6420aec362b0b7f0256086cb5a023d946df55994ed99c76ceb191e8a25e8059ae9b553ef1d546626d671b80af292f04d  readline83-002.patch
6b3ebffe994d0cd4d3466b15e3aee9a73613109283a4442f3bf10e28edcd1204df824c71356d66d01ac21014a806023a101fedf94526a19f6f590d9ffdc864cd  readline83-003.patch
"
"""
SQLITE_SOURCE_FIXTURE = """\
pkgname=sqlite
pkgver=3.53.4
source="https://www.sqlite.org/2026/sqlite-autoconf-$_ver.tar.gz
	https://www.sqlite.org/2026/sqlite-src-$_ver.zip
	"
sha512sums="
c24374e9393a943157f533f96e89e6c5743e5f5aad169d8393cff3088ca5ccbe5cc0561681ace49c349d0fe402298ee2624d319f422967247ce0792e3b3aa01e  sqlite-autoconf-3530400.tar.gz
4530f39a68e4e32460fc2656bc3ad9d8d73394390cb5c6668ff0755cb50d39219035677994d65078ad45ad126256c8c4e6a91afc5fcbc321883c805b11e7754e  sqlite-src-3530400.zip
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
            "kernel": "6.18.55",
        }

        self.assertEqual(_expand_reference("gcc-${pkgver%%_git*}", variables), "gcc-15.2.0")
        self.assertEqual(_expand_reference("linux-${kernel%.*}", variables), "linux-6.18")


class ConditionalSourceInventoryTest(unittest.TestCase):
    def materials(self, recipe=KERNEL_SOURCE_FIXTURE, pkgver="6.18.55"):
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

    def test_readline_patch_loop_expands_every_declared_patch(self):
        materials = _source_items(
            READLINE_SOURCE_FIXTURE,
            pathlib.Path("."),
            "pinned-test-commit",
            "main/readline/APKBUILD",
            "readline",
            "8.3.3",
            "1",
            "x86",
        )

        self.assertEqual(
            [item["declaredFilename"] for item in materials],
            [
                "readline-8.3.tar.gz",
                "readline83-001.patch",
                "readline83-002.patch",
                "readline83-003.patch",
            ],
        )
        self.assertEqual(
            [item["declaredChecksum"] for item in materials[-3:]],
            [
                "ced50af353ed527f6ec0eac5f65261f2ed208825ec72fe2acf5f0217f34f84f33dcbf01b895325f6b33664b5a426bac99506193e2ddb6eea8c79ccad37364b89",
                "e45ad6443bd4e271ec8e8ab883de561b6420aec362b0b7f0256086cb5a023d946df55994ed99c76ceb191e8a25e8059ae9b553ef1d546626d671b80af292f04d",
                "6b3ebffe994d0cd4d3466b15e3aee9a73613109283a4442f3bf10e28edcd1204df824c71356d66d01ac21014a806023a101fedf94526a19f6f590d9ffdc864cd",
            ],
        )

    def test_sqlite_recipe_version_derives_autoconf_source_version(self):
        materials = _source_items(
            SQLITE_SOURCE_FIXTURE,
            pathlib.Path("."),
            "pinned-test-commit",
            "main/sqlite/APKBUILD",
            "sqlite",
            "3.53.4",
            "0",
            "x86",
        )

        self.assertEqual(
            [item["declaredFilename"] for item in materials],
            ["sqlite-autoconf-3530400.tar.gz", "sqlite-src-3530400.zip"],
        )
        self.assertEqual(
            [item["declaredUrl"] for item in materials],
            [
                "https://www.sqlite.org/2026/sqlite-autoconf-3530400.tar.gz",
                "https://www.sqlite.org/2026/sqlite-src-3530400.zip",
            ],
        )

    def test_pinned_linux_recipe_prepends_stable_patch_with_alias_and_sha512(self):
        materials = self.materials()
        patch = materials[0]

        self.assertEqual(len(materials), 2)
        self.assertEqual(
            patch["reference"],
            "patch-6.18.55.patch.xz::https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.18.55.xz",
        )
        self.assertEqual(patch["referenceMode"], "APKBUILD source list")
        self.assertEqual(patch["declaredFilename"], "patch-6.18.55.patch.xz")
        self.assertEqual(
            patch["declaredUrl"],
            "https://cdn.kernel.org/pub/linux/kernel/v6.x/patch-6.18.55.xz",
        )
        self.assertEqual(patch["checksumAlgorithm"], "sha512")
        self.assertEqual(
            patch["declaredChecksum"],
            "274d804a47fc28a8260907ac27f2efc95a4668f67d31a036e88c82cdaf16e8a2ba33dce18f7b344595d2cbd60d310e7b6b0ccae6d1f4dab2eb65badb61e8ef66",
        )
        self.assertEqual(patch["kind"], "patch")

    def test_release_version_with_dot_zero_omits_stable_patch(self):
        recipe = KERNEL_SOURCE_FIXTURE.replace("pkgver=6.18.55", "pkgver=6.18.0").replace(
            "274d804a47fc28a8260907ac27f2efc95a4668f67d31a036e88c82cdaf16e8a2ba33dce18f7b344595d2cbd60d310e7b6b0ccae6d1f4dab2eb65badb61e8ef66  patch-6.18.55.patch.xz\n",
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

        with self.assertRaisesRegex(ValueError, "patch-6.18.55.patch.xz"):
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
